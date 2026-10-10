// Where student data lives.
//
//  - Without DATABASE_URL: plain JSON files in backend/data (fine for local development).
//  - With DATABASE_URL (a Postgres database such as Neon or Supabase): the runtime files below are kept
//    in the database, so students, chats and scores survive redeploys and restarts. Hosts with a
//    temporary disk (Render's free plan) lose files, but not database rows.
//
// readJson / writeJson / removeJson keep the same simple, synchronous shape the rest of the server uses.
// In database mode every runtime file is held in memory, and changes are written to the database a
// moment later (and on shutdown). The question bank and other content files always come from disk.
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import pg from "pg";
import { MongoClient } from "mongodb";

let DATA_DIR = "";
let pool = null;
let mongo = null; // { client, col } when MONGODB_URL is used
let mode = "files"; // "files" | "database"
let problem = ""; // set when a database was requested but could not be used
const mem = new Map(); // key -> JSON text (runtime files, database mode only)
const dirty = new Set(); // keys waiting to be written to the database
let timer = null;

// Files that hold data created while the app runs. Everything else (questions, topics...) stays on disk.
const RUNTIME = [/^(students|results|tr_results|searches|grammar_checks|groupchat|enquiries|settings|shayari_wall)\.json$/, /^chats\/[a-z0-9-]+\.json$/, /^usage\/(\d{4}-\d{2}-\d{2}|backfill)\.json$/];
const keyOf = (file) => path.relative(DATA_DIR, file).split(path.sep).join("/");
const isRuntime = (key) => RUNTIME.some((re) => re.test(key));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Explain a connection failure without leaking the password: an empty message usually means the URL was
// not understood and Postgres fell back to localhost.
function describeDbError(e, url) {
  const why = e.message || e.code || e.errors?.[0]?.code || "no details";
  let where = "DATABASE_URL is empty";
  try { const u = new URL(url); where = `trying ${u.hostname}:${u.port || 5432}`; } catch { if (url) where = "DATABASE_URL is not a valid address - it should start with postgresql://"; }
  return `${String(why).slice(0, 100)}; ${where}`;
}

export async function initStore({ dataDir, databaseUrl, mongoUrl, poolFactory } = {}) {
  DATA_DIR = dataDir;
  if (mongoUrl) return initMongo(mongoUrl);
  if (!databaseUrl && !poolFactory) return storeInfo();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const local = /localhost|127\.0\.0\.1/.test(databaseUrl || "");
      pool = poolFactory ? poolFactory() : new pg.Pool({ connectionString: databaseUrl, ssl: local ? false : { rejectUnauthorized: false }, max: 4, connectionTimeoutMillis: 8000 });
      pool.on?.("error", (e) => console.error("Database connection problem:", e.message));
      // Create the table only if it is missing (IF NOT EXISTS keeps two servers starting together safe).
      const exists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'app_files'");
      if (!exists.rows.length) await pool.query("CREATE TABLE IF NOT EXISTS app_files (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
      const { rows } = await pool.query("SELECT key, value FROM app_files");
      mem.clear();
      for (const r of rows) mem.set(r.key, r.value);
      mode = "database";
      problem = "";
      if (!rows.length && process.env.IMPORT_LOCAL_DATA === "true") importLocalFiles();
      console.log(`Student data is stored in the database (${rows.length} saved record${rows.length === 1 ? "" : "s"} loaded).`);
      return storeInfo();
    } catch (e) {
      problem = `Could not reach the database (${describeDbError(e, databaseUrl)})`;
      console.error(`${problem}; attempt ${attempt} of 4`);
      try { await pool?.end(); } catch {}
      pool = null;
      if (attempt < 4) await sleep(1500 * attempt);
    }
  }
  mode = "files";
  console.error("WARNING: running WITHOUT the database. Student data is written to this server's disk and may be lost on restart.");
  return storeInfo();
}

// MongoDB: the same key/value records, one document per file ({ _id: key, value, updated_at }).
let publicDns = false;
async function initMongo(url) {
  // mongodb+srv:// addresses need a DNS "SRV" lookup. Some networks cannot answer it, so fall back to public DNS.
  if (url.startsWith("mongodb+srv://")) {
    try {
      const host = new URL(url).hostname;
      await dns.promises.resolveSrv("_mongodb._tcp." + host);
      await dns.promises.resolveTxt(host).catch((e) => { if (e.code !== "ENODATA") throw e; });
    } catch (e) { dns.setServers(["8.8.8.8", "1.1.1.1"]); console.log(`Local DNS could not look up the MongoDB address (${e.code}); using public DNS instead.`); }
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    let client = null;
    try {
      client = new MongoClient(url, { serverSelectionTimeoutMS: 6000 });
      await client.connect();
      const col = client.db(process.env.MONGODB_DB || client.options.dbName || "speakeasy").collection("app_files");
      const rows = await col.find({}).toArray();
      mem.clear();
      for (const r of rows) mem.set(r._id, r.value);
      mongo = { client, col };
      mode = "database";
      problem = "";
      if (!rows.length && process.env.IMPORT_LOCAL_DATA === "true") importLocalFiles();
      console.log(`Student data is stored in MongoDB (${rows.length} saved record${rows.length === 1 ? "" : "s"} loaded).`);
      return storeInfo();
    } catch (e) {
      problem = `Could not reach MongoDB (${String(e.message).slice(0, 120)})`;
      if (url.startsWith("mongodb+srv://") && /ESERVFAIL|ETIMEOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(String(e.message)) && !publicDns) {
        publicDns = true; dns.setServers(["8.8.8.8", "1.1.1.1"]); console.log("DNS lookup failed; switching to public DNS.");
      }
      console.error(`${problem}; attempt ${attempt} of 4`);
      try { await client?.close(); } catch {}
      mongo = null;
      if (attempt < 4) await sleep(1500 * attempt);
    }
  }
  mode = "files";
  console.error("WARNING: running WITHOUT MongoDB. Student data is written to this server's disk and may be lost on restart.");
  return storeInfo();
}

// One-off import of the JSON files on disk into an empty database (set IMPORT_LOCAL_DATA=true once).
function importLocalFiles() {
  const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : []);
  let n = 0;
  for (const file of walk(DATA_DIR)) {
    const key = keyOf(file);
    if (!isRuntime(key)) continue;
    mem.set(key, JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8"))));
    dirty.add(key);
    n++;
  }
  if (n) { console.log(`Imported ${n} local data file(s) into the database.`); schedule(0); }
}

export function readJson(file, fallback) {
  const key = keyOf(file);
  if (mode === "database" && isRuntime(key)) {
    const text = mem.get(key);
    return text === undefined ? fallback : JSON.parse(text);
  }
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

export function writeJson(file, data) {
  const key = keyOf(file);
  if (mode === "database" && isRuntime(key)) {
    mem.set(key, JSON.stringify(data));
    dirty.add(key);
    schedule();
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function removeJson(file) {
  const key = keyOf(file);
  if (mode === "database" && isRuntime(key)) {
    mem.delete(key);
    dirty.add(key);
    schedule();
    return;
  }
  fs.rmSync(file, { force: true });
}

function schedule(ms = 200) {
  if (timer || !(pool || mongo)) return;
  timer = setTimeout(() => { timer = null; flush(); }, ms);
}

async function flush() {
  if (!pool && !mongo) return;
  const keys = [...dirty];
  dirty.clear();
  for (const key of keys) {
    try {
      if (mongo) {
        if (mem.has(key)) await mongo.col.replaceOne({ _id: key }, { _id: key, value: mem.get(key), updated_at: new Date() }, { upsert: true });
        else await mongo.col.deleteOne({ _id: key });
      } else if (mem.has(key)) await pool.query("INSERT INTO app_files (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [key, mem.get(key)]);
      else await pool.query("DELETE FROM app_files WHERE key = $1", [key]);
    } catch (e) {
      console.error(`Could not save "${key}" to the database: ${e.message}. Will retry.`);
      dirty.add(key);
      schedule(3000);
    }
  }
}

// Write everything still waiting; called when the server is shutting down.
export async function flushStore() {
  if (timer) { clearTimeout(timer); timer = null; }
  await flush();
  try { await mongo?.client.close(); } catch {}
}

export function storeInfo() {
  return { mode, kind: mongo ? "mongodb" : pool ? "postgres" : "files", persistent: mode === "database", problem, pending: dirty.size };
}
