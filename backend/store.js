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
import pg from "pg";

let DATA_DIR = "";
let pool = null;
let mode = "files"; // "files" | "database"
let problem = ""; // set when a database was requested but could not be used
const mem = new Map(); // key -> JSON text (runtime files, database mode only)
const dirty = new Set(); // keys waiting to be written to the database
let timer = null;

// Files that hold data created while the app runs. Everything else (questions, topics...) stays on disk.
const RUNTIME = [/^(students|results|tr_results|searches|grammar_checks|groupchat|enquiries)\.json$/, /^chats\/[a-z0-9-]+\.json$/, /^usage\/(\d{4}-\d{2}-\d{2}|backfill)\.json$/];
const keyOf = (file) => path.relative(DATA_DIR, file).split(path.sep).join("/");
const isRuntime = (key) => RUNTIME.some((re) => re.test(key));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function initStore({ dataDir, databaseUrl, poolFactory } = {}) {
  DATA_DIR = dataDir;
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
      problem = `Could not reach the database (${String(e.message).slice(0, 120)})`;
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
  if (timer || !pool) return;
  timer = setTimeout(() => { timer = null; flush(); }, ms);
}

async function flush() {
  if (!pool) return;
  const keys = [...dirty];
  dirty.clear();
  for (const key of keys) {
    try {
      if (mem.has(key)) await pool.query("INSERT INTO app_files (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [key, mem.get(key)]);
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
}

export function storeInfo() {
  return { mode, persistent: mode === "database", problem, pending: dirty.size };
}
