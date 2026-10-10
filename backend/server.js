import express from "express";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { initStore, readJson, writeJson, removeJson, flushStore, storeInfo } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local development: load backend/.env. On Render the variables come from the dashboard
// (dotenv never overrides variables that are already set, and a missing .env is fine).
dotenv.config({ path: path.join(__dirname, ".env") });
const PORT = process.env.PORT || 5000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
// Saved data (students, chats, scores...) goes in DATA_DIR. Set the DATA_DIR variable to use another folder,
// for example a Render Persistent Disk. The question bank and other content files always stay in backend/data.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");
const SEARCHES_FILE = path.join(DATA_DIR, "searches.json");
const TR_RESULTS_FILE = path.join(DATA_DIR, "tr_results.json");
const GRAMMAR_CHECKS_FILE = path.join(DATA_DIR, "grammar_checks.json");
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "questions.json"), "utf8"));
const TOPICS = Object.keys(bank);
const hindiBank = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "hindi_sentences.json"), "utf8"));

// Works with any OpenAI-compatible provider (OpenAI, Groq, Gemini, OpenRouter, Ollama) via OPENAI_BASE_URL.
// maxRetries 0 + a timeout so an overloaded model fails fast and the fallback model can take over.
// OPENAI_FALLBACK_MODEL may list several backups separated by commas; they are tried in order.
const FALLBACK_MODELS = (process.env.OPENAI_FALLBACK_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined, maxRetries: 0, timeout: 20000 })
  : null;
const app = express();
app.set("trust proxy", 1); // Render puts one proxy in front; this makes req.ip the visitor's real address
app.use(express.json({ limit: "100kb" }));
// Frontend lives next to backend/ in the repo (../Frontend). Fall back to other common spellings
// so a case-sensitive Linux host still finds it.
const FRONTEND_DIR = [path.join(__dirname, "..", "Frontend"), path.join(__dirname, "..", "frontend"), path.join(__dirname, "Frontend")]
  .find((dir) => fs.existsSync(path.join(dir, "index.html")));
if (!FRONTEND_DIR) console.error("WARNING: Frontend/index.html not found. Expected it at ../Frontend (next to the backend folder).");
const FRONTEND_INDEX = FRONTEND_DIR && path.join(FRONTEND_DIR, "index.html");
app.get("/favicon.ico", (_req, res) => res.type("image/svg+xml").sendFile(path.join(FRONTEND_DIR || __dirname, "favicon.svg")));
app.use(express.static(FRONTEND_DIR || __dirname)); // serves "/" as Frontend/index.html; the API routes below are matched separately

const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function askAI(system, messages, maxTokens = 1024) {
  if (!client) {
    const err = new Error("OPENAI_API_KEY is not set. Add it to backend/.env and restart.");
    err.status = 503;
    throw err;
  }
  let last;
  // Pass 1 tries every model in order. If they are all busy, wait a moment and make one more pass.
  for (let pass = 0; pass < 2; pass++) {
    for (const model of MODEL_CHAIN) {
      try {
        const res = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, ...messages],
        });
        return res.choices[0].message.content || "";
      } catch (e) {
        last = e;
        console.warn(`AI call failed on ${model}: ${e.status || e.name} ${String(e.message).replace(/\s+/g, " ").slice(0, 140)}`);
        // Overloaded (429/5xx), timed out or offline, or a retired model (404): try the next one.
        // Anything else (bad key, bad request) will not get better by retrying.
        if (e.status && e.status !== 404 && e.status !== 429 && e.status < 500) throw aiError(e);
      }
    }
    if (pass === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  throw aiError(last);
}

const MODEL_CHAIN = [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];

// Students see a short, useful message; the technical detail stays in the server log.
function aiError(e) {
  const s = e?.status;
  const msg = s === 429 ? "The AI is getting too many requests right now. Please wait a few seconds and try again."
    : s === 404 ? "The AI model isn't available right now. The admin needs to update the model name."
    : s === 401 || s === 403 ? "The AI key was rejected. The admin needs to check the API key."
    : !s || s >= 500 ? "The AI service is busy or unreachable right now. Please try again in a few seconds."
    : "The AI couldn't answer that. Please try again.";
  const err = new Error(msg);
  err.status = 503;
  return err;
}

function parseJson(text) {
  const oi = text.indexOf("{"), ai = text.indexOf("[");
  const start = oi < 0 ? ai : ai < 0 ? oi : Math.min(oi, ai);
  if (start < 0) throw Object.assign(new Error("The AI gave an unreadable answer. Please try again."), { status: 502 });
  const close = text[start] === "[" ? text.lastIndexOf("]") : text.lastIndexOf("}");
  if (close < start) throw Object.assign(new Error("The AI gave an unreadable answer. Please try again."), { status: 502 });
  return JSON.parse(text.slice(start, close + 1));
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e.message);
    res.status(e.status || 500).json({ error: e.message });
  });

// ---- Speaking practice: conversation partner that corrects mistakes ----
const CHAT_SYSTEM = `You are a friendly English speaking coach. The learner's messages are transcribed from speech, so ignore punctuation and capitalisation errors.
Reply conversationally in 1-3 short sentences and end with a question to keep them talking.
Also list real grammar mistakes in the learner's LAST message (tense, modals, passive, reported speech, non-finites, articles, prepositions, agreement).
Return ONLY JSON: {"reply": string, "corrections": [{"original": string, "corrected": string, "category": string, "rule": string}]}
Use an empty corrections array if the message is correct.`;

// ---- Students: name-based profiles (no password) ----
const CHAT_DIR = path.join(DATA_DIR, "chats");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
fs.mkdirSync(CHAT_DIR, { recursive: true });

const slug = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const LEVELS = ["beginner", "intermediate", "advanced"];

function getStudent(id) {
  if (!/^[a-z0-9-]{1,40}$/.test(id || "")) return null;
  return readJson(STUDENTS_FILE, {})[id] || null;
}
const chatFile = (id) => path.join(CHAT_DIR, `${id}.json`);

function requireStudent(req, res, next) {
  const id = req.params.id ?? req.body?.studentId ?? req.query.studentId;
  const student = getStudent(id);
  if (!student) return res.status(401).json({ error: "Unknown student. Please enter your name again." });
  const access = accessState(student);
  // A blocked student, or one who used up today's time, can do nothing except ask for their status.
  if (access.code !== "ok" && !req.allowLocked) return res.status(403).json({ error: access.message, code: access.code, access: publicAccess(access) });
  req.student = student;
  req.access = access;
  next();
}
const allowLocked = (req, _res, next) => { req.allowLocked = true; next(); };
// What a student may see about themselves: never the admin's private notes or block details.
const publicStudent = ({ adminNotes, blocked, blockReason, extra, dailyLimitMin, lastPing, ...rest }) => rest;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.info","guerrillamail.net","guerrillamail.org","guerrillamail.de","guerrillamailblock.com",
  "tempmail.com","temp-mail.org","temp-mail.io","trashmail.com","trashmail.me","trashmail.net","trashmail.org","trashmail.io","trashmail.de","trashmail.at",
  "yopmail.com","yopmail.fr","sharklasers.com","maildrop.cc","throwaway.email","discard.email","tempr.email","spam4.me","grr.la",
  "mailnesia.com","fakeinbox.com","fakeinbox.net","getnada.com","nada.email","dispostable.com","mohmal.com","mailexpire.com",
  "spamgourmet.com","spamgourmet.net","spamgourmet.org","filzmail.com","0-mail.com","bigstring.com","mytemp.email",
  "mailnull.com","mail-temp.com","throwam.com","spamfree24.org","mailmetrash.com","mailin8r.com","mailinator2.com",
]);
const newAccountTimes = new Map(); // ip → timestamps of new account creations (spam guard)
const EMAIL_RE_LOGIN = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-().]+$/; // valid chars; digit count checked separately

app.post("/api/login", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  const id = slug(name);
  if (!id) return res.status(400).json({ error: "Please enter your name (letters or numbers)." });
  if ((name.match(/[a-zA-Z]/g) || []).length < 2) return res.status(400).json({ error: "Please enter your real name (at least 2 letters)." });
  const age = Number.parseInt(req.body.age, 10);
  if (!Number.isInteger(age) || age < 10 || age > 100) return res.status(400).json({ error: "You must be at least 10 years old to use this app." });
  const students = readJson(STUDENTS_FILE, {});
  if (students[id]?.blocked) { const a = accessState(students[id]); return res.status(403).json({ error: a.message, code: "blocked", access: publicAccess(a) }); }
  const now = new Date().toISOString();
  const isNew = !students[id];
  if (isNew) {
    const ipNew = (newAccountTimes.get(req.ip) || []).filter(t => Date.now() - t < 3600e3);
    if (ipNew.length >= 3) return res.status(429).json({ error: "Too many new accounts created from this connection. Please wait before trying again." });
    newAccountTimes.set(req.ip, [...ipNew, Date.now()]);
  }
  students[id] ??= { id, name, level: "intermediate", created: now };
  students[id].age = age;
  students[id].visits = (students[id].visits || 0) + 1;
  if (LEVELS.includes(req.body.level)) students[id].level = req.body.level;
  const phone = String(req.body.phone || "").trim().slice(0, 20);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 100);
  const city = String(req.body.city || "").trim().slice(0, 40);
  if (email) {
    if (!EMAIL_RE_LOGIN.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    const emailDomain = email.split("@")[1];
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) return res.status(400).json({ error: "Temporary or disposable email addresses are not allowed. Please use your real email." });
    const dup = Object.values(students).find(s => s.id !== id && s.email === email);
    if (dup) return res.status(409).json({ error: "That email is already linked to another account. Please use your original name to sign in." });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!PHONE_RE.test(phone) || digits.length < 7 || digits.length > 15) return res.status(400).json({ error: "Please enter a valid phone number (7–15 digits). You can include +, spaces, or dashes." });
    const dup = Object.values(students).find(s => s.id !== id && s.phone === phone);
    if (dup) return res.status(409).json({ error: "That phone number is already linked to another account. Please use your original name to sign in." });
  }
  if (phone) students[id].phone = phone;
  if (email) students[id].email = email;
  if (city) students[id].city = city;
  students[id].lastSeen = now;
  writeJson(STUDENTS_FILE, students);
  track(id, "l");
  res.json({ student: publicStudent(students[id]), isNew, access: publicAccess(accessState(students[id])) });
});

// Heartbeat: credits active time. Credit is capped by real elapsed time since the last ping.
app.post("/api/students/:id/ping", requireStudent, (req, res) => {
  const students = readJson(STUDENTS_FILE, {});
  const s = students[req.student.id];
  const now = Date.now();
  const elapsed = s.lastPing ? (now - s.lastPing) / 1000 : Infinity;
  const asked = Math.max(0, Math.min(Number(req.body.seconds) || 0, 60));
  // First ping, or one after a long gap (tab closed): credit at most one heartbeat interval.
  let credit = elapsed < 120 ? Math.min(asked, elapsed) : Math.min(asked, 15);
  if (req.access.remaining != null) credit = Math.min(credit, req.access.remaining); // stop exactly at the limit
  s.timeSpent = Math.round(((s.timeSpent || 0) + credit) * 10) / 10;
  s.lastPing = now;
  s.lastSeen = new Date(now).toISOString();
  writeJson(STUDENTS_FILE, students);
  track(req.student.id, "s", credit);
  res.json({ ok: true, access: publicAccess(accessState(s)) });
});

// ---- Admin: protected by ADMIN_PASSWORD ----
function requireAdmin(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.status(503).json({ error: "Admin is disabled. Set ADMIN_PASSWORD in backend/.env and restart." });
  const given = Buffer.from(String(req.get("x-admin-key") || ""));
  const want = Buffer.from(pw);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return res.status(403).json({ error: "Wrong admin password." });
  next();
}

// ---- Dictionary search logging ----
app.post("/api/log/search", requireStudent, (req, res) => {
  const word = String(req.body.word || "").trim().toLowerCase().slice(0, 100);
  if (!word) return res.status(400).json({ error: "word required" });
  const searches = readJson(SEARCHES_FILE, []);
  searches.push({ studentId: req.student.id, name: req.student.name, word, at: new Date().toISOString() });
  if (searches.length > 5000) searches.splice(0, searches.length - 5000);
  writeJson(SEARCHES_FILE, searches);
  track(req.student.id, "d");
  res.json({ ok: true });
});

app.get("/api/admin/summary", requireAdmin, (_req, res) => {
  const students = Object.values(readJson(STUDENTS_FILE, {}));
  const results = readJson(RESULTS_FILE, []);
  const searches = readJson(SEARCHES_FILE, []);
  const trResults = readJson(TR_RESULTS_FILE, []);
  const grammarChecks = readJson(GRAMMAR_CHECKS_FILE, []);
  const day = 24 * 3600e3;
  const since = (ms) => students.filter((s) => Date.now() - new Date(s.lastSeen).getTime() < ms).length;

  const searchesByStudent = {};
  for (const s of searches) searchesByStudent[s.studentId] = (searchesByStudent[s.studentId] || 0) + 1;

  const trByStudent = {};
  for (const r of trResults) {
    trByStudent[r.studentId] ??= { count: 0, totalPct: 0 };
    trByStudent[r.studentId].count++;
    trByStudent[r.studentId].totalPct += Math.round((r.score / r.maxScore) * 100);
  }

  const grammarByStudent = {};
  for (const g of grammarChecks) grammarByStudent[g.studentId] = (grammarByStudent[g.studentId] || 0) + 1;

  const todayUsage = readJson(usageFile(dayKey()), {});
  const users = students.map((s) => {
    const mine = results.filter((r) => r.studentId === s.id);
    const q = mine.reduce((n, r) => n + r.total, 0);
    const chat = readJson(chatFile(s.id), []);
    const tr = trByStudent[s.id];
    const acc = accessState(s, todayUsage);
    return {
      id: s.id, name: s.name, age: s.age ?? null, level: s.level, phone: s.phone || "", email: s.email || "", city: s.city || "", created: s.created, lastSeen: s.lastSeen, visits: s.visits || 1,
      online: Date.now() - new Date(s.lastSeen).getTime() < 60000,
      timeSpent: Math.round(s.timeSpent || 0),
      messages: chat.filter((m) => m.role === "user").length,
      tests: mine.length,
      avgScore: q ? Math.round((mine.reduce((n, r) => n + r.score, 0) / q) * 100) : null,
      searches: searchesByStudent[s.id] || 0,
      trTests: tr?.count || 0,
      trAvgScore: tr ? Math.round(tr.totalPct / tr.count) : null,
      grammarChecks: grammarByStudent[s.id] || 0,
      chatMuted: !!s.chatMuted,
      adminNotes: s.adminNotes || "",
      blocked: !!s.blocked, blockReason: s.blockReason || "", dailyLimitMin: s.dailyLimitMin ?? null,
      access: acc.code, usedTodaySec: acc.used, limitSec: acc.limit ?? null, extraMin: s.extra?.day === dayKey() ? Math.round(s.extra.seconds / 60) : 0,
    };
  }).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

  const ages = users.map((u) => u.age).filter((a) => a != null);
  const groups = { "Under 13": 0, "13-17": 0, "18-25": 0, "26-40": 0, "41+": 0 };
  for (const a of ages) groups[a < 13 ? "Under 13" : a <= 17 ? "13-17" : a <= 25 ? "18-25" : a <= 40 ? "26-40" : "41+"]++;

  const wordCounts = {};
  for (const s of searches) wordCounts[s.word] = (wordCounts[s.word] || 0) + 1;
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
  const recentSearches = searches.slice(-100).reverse().map(({ name, word, at }) => ({ name, word, at }));

  const searchDayCounts = {};
  for (const s of searches) { const d = s.at.slice(0, 10); searchDayCounts[d] = (searchDayCounts[d] || 0) + 1; }
  const searchTrend = Array.from({ length: 14 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (13 - i));
    const d = dt.toISOString().slice(0, 10);
    return { day: d, count: searchDayCounts[d] || 0 };
  });
  const uniqueSearchWords = Object.keys(wordCounts).length;
  const totalSearchers = new Set(searches.map((s) => s.studentId)).size;

  res.json({
    storage: storeInfo(),
    settings: getSettings(),
    blockedCount: students.filter((x) => x.blocked).length,
    activeToday: Object.keys(readJson(usageFile(dayKey()), {})).length,
    newEnquiries: readJson(ENQUIRIES_FILE, []).filter((e) => e.status === "new").length,
    totalUsers: students.length,
    onlineNow: users.filter((u) => u.online).length,
    active24h: since(day),
    active7d: since(7 * day),
    totalTests: results.length,
    totalTrTests: trResults.length,
    totalSearches: searches.length,
    totalGrammarChecks: grammarChecks.length,
    totalTime: users.reduce((n, u) => n + u.timeSpent, 0),
    avgTime: users.length ? Math.round(users.reduce((n, u) => n + u.timeSpent, 0) / users.length) : 0,
    avgAge: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null,
    ageGroups: groups,
    byLevel: LEVELS.map((l) => ({ level: l, count: students.filter((s) => s.level === l).length })),
    topWords,
    recentSearches,
    searchTrend,
    uniqueSearchWords,
    totalSearchers,
    users,
  });
});

app.get("/api/admin/users/:id/tests", requireAdmin, (req, res) => {
  const id = req.params.id;
  const s = getStudent(id);
  const mcq = readJson(RESULTS_FILE, []).filter((r) => r.studentId === id);
  const tr = readJson(TR_RESULTS_FILE, []).filter((r) => r.studentId === id);
  const grammar = readJson(GRAMMAR_CHECKS_FILE, []).filter((r) => r.studentId === id);
  const searches = readJson(SEARCHES_FILE, []).filter((r) => r.studentId === id);
  const profile = s ? { name: s.name, age: s.age ?? null, level: s.level, phone: s.phone || "", email: s.email || "", city: s.city || "", created: s.created, lastSeen: s.lastSeen, visits: s.visits || 1, timeSpent: Math.round(s.timeSpent || 0), adminNotes: s.adminNotes || "" } : null;
  res.json({ profile, mcq, tr, grammar, searches });
});

app.get("/api/students/:id/grammar-history", requireStudent, (req, res) => {
  res.json(readJson(GRAMMAR_CHECKS_FILE, []).filter((r) => r.studentId === req.student.id).slice(-30).reverse());
});

app.get("/api/students/:id/chat", requireStudent, (req, res) => res.json(readJson(chatFile(req.student.id), [])));

app.delete("/api/students/:id/chat", requireStudent, (req, res) => {
  removeJson(chatFile(req.student.id));
  res.json({ ok: true });
});

app.get("/api/students/:id/progress", requireStudent, (req, res) => {
  const chat = readJson(chatFile(req.student.id), []);
  const userMsgs = chat.filter((m) => m.role === "user");
  const byCategory = {};
  for (const m of userMsgs) for (const c of m.corrections || []) {
    const k = String(c.category || "other").toLowerCase();
    byCategory[k] = (byCategory[k] || 0) + 1;
  }
  const tests = readJson(RESULTS_FILE, []).filter((r) => r.studentId === req.student.id);
  const byTopic = {};
  for (const t of tests) for (const [topic, v] of Object.entries(t.byTopic)) {
    byTopic[topic] ??= { correct: 0, total: 0 };
    byTopic[topic].correct += v.correct;
    byTopic[topic].total += v.total;
  }
  const byDifficulty = {};
  for (const t of tests) for (const [d, v] of Object.entries(t.byDifficulty || {})) {
    byDifficulty[d] ??= { correct: 0, total: 0 };
    byDifficulty[d].correct += v.correct;
    byDifficulty[d].total += v.total;
  }
  const totalQ = tests.reduce((s, t) => s + t.total, 0);
  res.json({
    student: publicStudent(req.student),
    messages: userMsgs.length,
    corrections: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
    testsTaken: tests.length,
    avgScore: totalQ ? Math.round((tests.reduce((s, t) => s + t.score, 0) / totalQ) * 100) : null,
    byTopic,
    byDifficulty,
    recentTests: tests.slice(-10).reverse(),
  });
});

app.post("/api/chat", requireStudent, wrap(async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: "text required" });
  const saved = readJson(chatFile(req.student.id), []);
  const context = [...saved.slice(-20).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: text }];
  const system = `${CHAT_SYSTEM}\nThe learner's name is ${req.student.name} and their level is ${req.student.level}. Match your vocabulary to that level.`;
  const out = parseJson(await askAI(system, context));
  const reply = out.reply || "";
  const corrections = Array.isArray(out.corrections) ? out.corrections : [];
  const at = new Date().toISOString();
  saved.push({ role: "user", content: text, corrections, at }, { role: "assistant", content: reply, at });
  writeJson(chatFile(req.student.id), saved.slice(-500));
  track(req.student.id, "m");
  res.json({ reply, corrections });
}));

// ---- Grammar checker: sentence-level analysis ----
const GRAMMAR_SYSTEM = `You are an expert English grammar examiner. Analyse the user's text sentence by sentence and identify every grammatical feature listed below.

For each sentence return ALL of the following fields:
- text: the original sentence
- tense: full name e.g. "Present Perfect Continuous"
- aspect: "simple"|"continuous"|"perfect"|"perfect continuous"
- voice: "active"|"passive"
- mood: "indicative"|"imperative"|"subjunctive"
- speech: "direct"|"indirect"|"none"
- conditional: "none"|"zero"|"first"|"second"|"third"|"mixed"
- modals: array of objects {word, meaning} e.g. {"word":"must","meaning":"obligation"}
- nonFinites: array of objects {form, word, function} where form is "infinitive"|"gerund"|"participle", e.g. {"form":"gerund","word":"swimming","function":"subject"}
- connectors: array of objects {word, type} where type is "coordinating"|"subordinating"|"correlative"|"conjunctive adverb"|"discourse marker"
- clauses: array of strings naming clause types present, e.g. ["main","relative","adverbial"]
- articles: array of objects {used, noun, correct, note} — only include where article choice is notable or wrong
- errors: array of objects {category, issue, fix, explanation} where category is one of: "tense"|"aspect"|"modal"|"voice"|"narration"|"non-finite"|"gerund"|"infinitive"|"participle"|"connector"|"conditional"|"imperative"|"article"|"preposition"|"agreement"|"spelling"|"word order"|"other"

Return ONLY valid JSON (no markdown, no commentary):
{"correctedText": string, "sentences": [{ "text": string, "tense": string, "aspect": string, "voice": string, "mood": string, "speech": string, "conditional": string, "modals": [], "nonFinites": [], "connectors": [], "clauses": [], "articles": [], "errors": [] }]}`;

app.post("/api/grammar", requireStudent, wrap(async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: "text required" });
  const result = parseJson(await askAI(GRAMMAR_SYSTEM, [{ role: "user", content: text }], 4096));
  const student = getStudent(String(req.body.studentId || ""));
  if (student) {
    const errorTypes = [...new Set((result.sentences || []).flatMap((s) => (s.errors || []).map((e) => String(e.category || "other").toLowerCase())))];
    const errorCount = (result.sentences || []).reduce((n, s) => n + (s.errors || []).length, 0);
    const checks = readJson(GRAMMAR_CHECKS_FILE, []);
    checks.push({ studentId: student.id, name: student.name, text: text.slice(0, 200), errorCount, errorTypes, at: new Date().toISOString() });
    if (checks.length > 10000) checks.splice(0, checks.length - 10000);
    writeJson(GRAMMAR_CHECKS_FILE, checks);
    track(student.id, "g");
  }
  res.json(result);
}));

// ---- Hindi → English translation ----
const TRANSLATE_SYSTEM = `You are an expert Hindi-to-English translator and English grammar teacher.
The input may be Hindi in Devanagari or in Roman letters (Hinglish, e.g. "mujhe waha jana hai"). Handle both.
Translate the WHOLE text into natural, complete English sentences. Split the input into sentences and analyse each one.
Show "hindi" in Devanagari and "transliteration" in Roman letters.

For each sentence, classify the ENGLISH translation. Choose ONE category using this priority:
1. "Modal" - contains a modal or semi-modal: can, could, may, might, must, should, would, ought to, need to, have to, be able to, used to. (Plain future "will/shall" is NOT modal; treat it as Tense: Simple Future. Use Modal only if will/would expresses willingness, a request, or a habit.)
2. "Passive" - passive voice.
3. "Conditional" - if-clause sentences.
4. "Narration" - reported speech.
5. "Non-finite" - the sentence is built around an infinitive, gerund or participle phrase.
6. "Tense" - a clear non-basic tense: any continuous, perfect, perfect continuous or future form (e.g. Present Perfect, Past Continuous, Simple Future).
7. "Simple sentence" - a basic subject-verb(-object) statement, question or command in Simple Present or Simple Past, with none of the above.

Return ONLY valid JSON, no markdown fences:
{
  "translation": string (the full English translation, all sentences joined),
  "sentences": [{
    "hindi": string,
    "english": string (full English sentence),
    "analysis": {
      "category": "Modal"|"Passive"|"Conditional"|"Narration"|"Non-finite"|"Tense"|"Simple sentence",
      "tense": string (e.g. "Simple Present", "Present Perfect Continuous"),
      "modal": string (e.g. "have to - obligation", or "" if none),
      "voice": "active"|"passive",
      "sentenceType": "statement"|"question"|"negative"|"command"|"exclamation",
      "structure": string (pattern, e.g. "Subject + have to + V1 + object"),
      "why": string (one short sentence explaining why it belongs to this category)
    },
    "alternatives": [string] (up to 2 other valid translations if the Hindi is ambiguous, otherwise [])
  }],
  "words": [{"hindi": string, "transliteration": string, "english": string}] (key content words only, max 12),
  "note": string (one useful grammar or usage difference between Hindi and English, or "")
}`;

app.post("/api/translate", requireStudent, wrap(async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: "text required" });
  res.json(parseJson(await askAI(TRANSLATE_SYSTEM, [{ role: "user", content: text }], 2500)));
}));

// ---- Interview preparation ----
const interviewSessions = new Map();
const INTERVIEW_MAX_ROUNDS = 6;

function makeInterviewSystem(type, role, level) {
  const labels = { job: "job", ielts: "IELTS Speaking Test", university: "university admission", general: "general English" };
  const roleCtx = role ? ` for the role of "${role}"` : "";
  const levelCtx = level ? ` The candidate's English level is ${level}.` : "";
  return `You are an expert interviewer conducting a mock ${labels[type] || "general English"} interview${roleCtx}.${levelCtx}

Conduct exactly ${INTERVIEW_MAX_ROUNDS} questions, one at a time.

For the very first message "START": return only the first question with empty feedback, null score, empty corrections array.
After each subsequent answer:
  1. Give specific content feedback (use STAR method for job interviews, band criteria for IELTS, etc.)
  2. Rate the answer 1–5
  3. List grammar/vocabulary corrections
  4. Ask the next question

After the ${INTERVIEW_MAX_ROUNDS}th answer: set done=true, nextQuestion="", write a comprehensive finalSummary (3–5 sentences: overall performance, key strengths, areas to improve).

Return ONLY valid JSON — no markdown fences:
{"feedback":string,"score":number|null,"corrections":[{"original":string,"corrected":string,"rule":string}],"nextQuestion":string,"done":boolean,"finalSummary":string}`;
}

app.post("/api/interview/start", requireStudent, wrap(async (req, res) => {
  const type = ["job", "ielts", "university", "general"].includes(req.body.type) ? req.body.type : "general";
  const role = String(req.body.role || "").trim().slice(0, 80);
  const system = makeInterviewSystem(type, role, req.student.level);
  const history = [{ role: "user", content: "START" }];
  const out = parseJson(await askAI(system, history, 600));
  history.push({ role: "assistant", content: JSON.stringify(out) });
  const interviewId = randomUUID();
  interviewSessions.set(interviewId, { system, history, round: 0, created: Date.now() });
  for (const [id, s] of interviewSessions) if (Date.now() - s.created > 4 * 3600e3) interviewSessions.delete(id);
  res.json({ interviewId, question: out.nextQuestion || "" });
}));

app.post("/api/interview/respond", requireStudent, wrap(async (req, res) => {
  const { interviewId } = req.body;
  const answer = String(req.body.answer || "").trim().slice(0, 3000);
  if (!answer) return res.status(400).json({ error: "answer required" });
  const session = interviewSessions.get(interviewId);
  if (!session) return res.status(404).json({ error: "Interview session not found or expired." });
  session.round++;
  session.history.push({ role: "user", content: answer });
  const out = parseJson(await askAI(session.system, session.history, 1200));
  session.history.push({ role: "assistant", content: JSON.stringify(out) });
  if (out.done) interviewSessions.delete(interviewId);
  res.json({
    feedback: out.feedback || "",
    score: typeof out.score === "number" ? out.score : null,
    corrections: Array.isArray(out.corrections) ? out.corrections : [],
    nextQuestion: out.nextQuestion || "",
    done: !!out.done,
    finalSummary: out.finalSummary || "",
    round: session.round,
    total: INTERVIEW_MAX_ROUNDS,
  });
}));

// ---- Group chat: shared rooms; the page polls for new messages ----
const GC_FILE = path.join(DATA_DIR, "groupchat.json");
const GC_ROOMS = { general: "General", grammar: "Grammar help", speaking: "Speaking practice", discussion: "Group discussion" };
const GC_MAX_PER_ROOM = 300;
const gcLastPost = new Map(); // studentId -> timestamp, for a simple rate limit
const gcLoad = () => readJson(GC_FILE, { nextId: 1, rooms: {} });
const GC_EMOJI = ["👍", "❤️", "😂", "😮", "🎉", "👏"];

function adminKeyOk(req) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const given = Buffer.from(String(req.get("x-admin-key") || ""));
  const want = Buffer.from(pw);
  return given.length === want.length && timingSafeEqual(given, want);
}
// What a viewer is allowed to see of a message: reactions become {emoji, count, mine, names}.
function gcView(m, viewerId, students = readJson(STUDENTS_FILE, {})) {
  const { reactions = {}, u, ...rest } = m;
  return {
    ...rest,
    reactions: Object.entries(reactions).map(([emoji, ids]) => ({
      emoji, count: ids.length, mine: ids.includes(viewerId), names: ids.slice(0, 8).map((id) => students[id]?.name || "Someone"),
    })),
  };
}
// Shared checks for anything a student writes in the chat. They answer the request themselves when they refuse.
function gcBlocked(req, res) {
  if (gcLoad().enabled === false) { res.status(403).json({ error: "Group chat is switched off by the admin." }); return true; }
  if (req.student.chatMuted) { res.status(403).json({ error: "You have been muted by the admin and cannot do that." }); return true; }
  return false;
}
function gcCleanText(req, res) {
  const text = String(req.body.text || "").trim().slice(0, 500);
  if (!text) { res.status(400).json({ error: "Write a message first." }); return null; }
  if (/(https?:\/\/|www\.)/i.test(text)) { res.status(400).json({ error: "Links are not allowed in the group chat." }); return null; }
  return text;
}
function gcFind(data, room, id) { return (data.rooms[room] || []).find((m) => m.id === parseInt(id, 10)); }

function requireRoom(req, res, next) {
  if (!GC_ROOMS[req.params.room]) return res.status(404).json({ error: "Unknown room" });
  next();
}

app.get("/api/groupchat/:room", requireRoom, requireStudent, (req, res) => {
  const data = gcLoad();
  const msgs = data.rooms[req.params.room] || [];
  const after = parseInt(req.query.after, 10) || 0;
  const since = parseInt(req.query.since, 10) || 0; // pages also ask for messages edited or reacted to since their last poll
  const recent = msgs.slice(-100);
  const isOnline = (s) => Date.now() - new Date(s.lastSeen).getTime() < 60000;
  const allStudents = readJson(STUDENTS_FILE, {});
  // Members: names only (never age, level or id), online people first.
  const members = Object.values(allStudents)
    .map((s) => ({ name: s.name, online: isOnline(s) }))
    .sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
  res.json({
    messages: (after ? recent.filter((m) => m.id > after || (since && (m.u || 0) > since)) : recent.slice(-50))
      .map((m) => gcView(m, req.student.id, allStudents)),
    serverTime: Date.now(),
    ids: recent.map((m) => m.id), // lets pages drop messages that were deleted
    online: members.filter((m) => m.online).length,
    members,
    enabled: data.enabled !== false,
    muted: !!req.student.chatMuted,
  });
});

app.post("/api/groupchat/:room", requireRoom, requireStudent, (req, res) => {
  if (gcBlocked(req, res)) return;
  const text = gcCleanText(req, res);
  if (text === null) return;
  const last = gcLastPost.get(req.student.id) || 0;
  if (Date.now() - last < 1000) return res.status(429).json({ error: "You're sending messages too fast. Wait a second." });
  gcLastPost.set(req.student.id, Date.now());
  const data = gcLoad();
  const msg = { id: data.nextId++, studentId: req.student.id, name: req.student.name, text, at: new Date().toISOString() };
  track(req.student.id, "c");
  data.rooms[req.params.room] = [...(data.rooms[req.params.room] || []), msg].slice(-GC_MAX_PER_ROOM);
  writeJson(GC_FILE, data);
  res.json(gcView(msg, req.student.id));
});

// NOTE: message routes use :msgId on purpose; requireStudent reads req.params.id as a *student* id.
// Edit your own message.
app.patch("/api/groupchat/:room/:msgId", requireRoom, requireStudent, (req, res) => {
  if (gcBlocked(req, res)) return;
  const text = gcCleanText(req, res);
  if (text === null) return;
  const data = gcLoad();
  const msg = gcFind(data, req.params.room, req.params.msgId);
  if (!msg) return res.status(404).json({ error: "That message no longer exists." });
  if (msg.studentId !== req.student.id) return res.status(403).json({ error: "You can only edit your own messages." });
  msg.text = text;
  msg.edited = true;
  msg.u = Date.now();
  writeJson(GC_FILE, data);
  res.json(gcView(msg, req.student.id));
});

// React with an emoji; sending the same emoji again removes your reaction.
app.post("/api/groupchat/:room/:msgId/react", requireRoom, requireStudent, (req, res) => {
  if (gcBlocked(req, res)) return;
  const emoji = String(req.body.emoji || "");
  if (!GC_EMOJI.includes(emoji)) return res.status(400).json({ error: "That reaction is not available." });
  const data = gcLoad();
  const msg = gcFind(data, req.params.room, req.params.msgId);
  if (!msg) return res.status(404).json({ error: "That message no longer exists." });
  msg.reactions ??= {};
  const who = (msg.reactions[emoji] ??= []);
  const i = who.indexOf(req.student.id);
  if (i >= 0) who.splice(i, 1); else who.push(req.student.id);
  if (!who.length) delete msg.reactions[emoji];
  msg.u = Date.now();
  writeJson(GC_FILE, data);
  res.json(gcView(msg, req.student.id));
});

// ---- Group chat: admin tools ----
app.get("/api/admin/groupchat", requireAdmin, (req, res) => {
  const data = gcLoad();
  const room = GC_ROOMS[req.query.room] ? req.query.room : "general";
  const students = Object.values(readJson(STUDENTS_FILE, {}));
  res.json({
    enabled: data.enabled !== false,
    rooms: Object.entries(GC_ROOMS).map(([id, label]) => ({ id, label, count: (data.rooms[id] || []).length })),
    room,
    messages: (data.rooms[room] || []).slice(-100),
    muted: students.filter((s) => s.chatMuted).map((s) => ({ id: s.id, name: s.name })),
  });
});

app.post("/api/admin/groupchat/enabled", requireAdmin, (req, res) => {
  const data = gcLoad();
  data.enabled = !!req.body.enabled;
  writeJson(GC_FILE, data);
  res.json({ enabled: data.enabled });
});

app.post("/api/admin/groupchat/:room/announce", requireRoom, requireAdmin, (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "Write a message first." });
  const data = gcLoad();
  const msg = { id: data.nextId++, studentId: "admin", name: "Admin", admin: true, text, at: new Date().toISOString() };
  data.rooms[req.params.room] = [...(data.rooms[req.params.room] || []), msg].slice(-GC_MAX_PER_ROOM);
  writeJson(GC_FILE, data);
  res.json(msg);
});

app.delete("/api/admin/groupchat/:room", requireRoom, requireAdmin, (req, res) => {
  const data = gcLoad();
  data.rooms[req.params.room] = [];
  writeJson(GC_FILE, data);
  res.json({ ok: true });
});

app.post("/api/admin/students/:id/mute", requireAdmin, (req, res) => {
  const students = readJson(STUDENTS_FILE, {});
  const s = students[req.params.id];
  if (!s) return res.status(404).json({ error: "Unknown student" });
  s.chatMuted = !!req.body.muted;
  writeJson(STUDENTS_FILE, students);
  res.json({ id: s.id, chatMuted: s.chatMuted });
});

app.patch("/api/admin/students/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return res.status(400).json({ error: "Invalid student id" });
  const students = readJson(STUDENTS_FILE, {});
  const s = students[id];
  if (!s) return res.status(404).json({ error: "Unknown student" });
  if (LEVELS.includes(req.body.level)) s.level = req.body.level;
  const age = Number.parseInt(req.body.age, 10);
  if (Number.isInteger(age) && age >= 3 && age <= 100) s.age = age;
  if (typeof req.body.adminNotes === "string") s.adminNotes = req.body.adminNotes.trim().slice(0, 500);
  if (typeof req.body.name === "string" && req.body.name.trim()) s.name = req.body.name.trim().slice(0, 40);
  for (const [key, max] of [["city", 40], ["phone", 20], ["email", 100]]) {
    if (typeof req.body[key] !== "string") continue;
    const v = req.body[key].trim().slice(0, max);
    if (key === "email" && v && !EMAIL_RE.test(v)) return res.status(400).json({ error: "That email address does not look right." });
    if (v) s[key] = key === "email" ? v.toLowerCase() : v; else delete s[key];
  }
  writeJson(STUDENTS_FILE, students);
  res.json({ ok: true, student: s });
});

// Delete a message: the admin (admin key) can delete any; a student can delete only their own.
app.delete("/api/groupchat/:room/:msgId", requireRoom, (req, res) => {
  const data = gcLoad();
  const msg = gcFind(data, req.params.room, req.params.msgId);
  if (msg && !adminKeyOk(req)) {
    const student = getStudent(String(req.query.studentId || ""));
    if (!student) return res.status(401).json({ error: "Please sign in again." });
    if (msg.studentId !== student.id) return res.status(403).json({ error: "You can only delete your own messages." });
  }
  const id = parseInt(req.params.msgId, 10);
  data.rooms[req.params.room] = (data.rooms[req.params.room] || []).filter((m) => m.id !== id);
  writeJson(GC_FILE, data);
  res.json({ ok: true });
});

// ---- Discussion & presentation topics (static content) ----
const discussion = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "discussion.json"), "utf8"));
app.get("/api/discussion", (_req, res) => res.json(discussion));

// ---- Test: question bank, graded on the server ----
const sessions = new Map(); // testId -> { questions, created }

app.get("/api/topics", (_req, res) => res.json(TOPICS.map((t) => ({ id: t, count: bank[t].length }))));

// Difficulty: the student's level sets the base, age adjusts it. Under-12s move one step easier
// and under-9s always start on easy. Auto mode blends difficulties (shares of easy/medium/hard).
const DIFFS = ["easy", "medium", "hard"];
const AUTO_MIX = { easy: [0.7, 0.3, 0], medium: [0.25, 0.5, 0.25], hard: [0.1, 0.4, 0.5] };

function recommendedDifficulty(student) {
  if (!student) return "medium";
  let idx = Math.max(0, LEVELS.indexOf(student.level));
  if (student.age != null) {
    if (student.age <= 11) idx -= 1;
    if (student.age <= 8) idx = 0;
  }
  return DIFFS[Math.min(2, Math.max(0, idx))];
}

// Takes n questions following the mix; if a difficulty runs short, fills from the nearest ones.
function pickByDifficulty(pool, n, mix, targetIdx) {
  const byDiff = DIFFS.map((d) => shuffle(pool.filter((q) => q.difficulty === d)));
  const quota = mix.map((m) => Math.floor(m * n));
  let rest = n - quota.reduce((a, b) => a + b, 0);
  for (const i of [0, 1, 2].sort((a, b) => mix[b] - mix[a])) if (rest-- > 0) quota[i]++;
  const taken = byDiff.map((list, i) => list.splice(0, quota[i]));
  let short = n - taken.flat().length;
  for (const i of [0, 1, 2].sort((a, b) => Math.abs(a - targetIdx) - Math.abs(b - targetIdx))) {
    if (short <= 0) break;
    const extra = byDiff[i].splice(0, short);
    taken[i].push(...extra);
    short -= extra.length;
  }
  return taken.flat(); // easy first, then medium, then hard
}

app.get("/api/students/:id/difficulty", requireStudent, (req, res) => {
  res.json({ recommended: recommendedDifficulty(req.student), age: req.student.age ?? null, level: req.student.level });
});

app.get("/api/test", (req, res) => {
  const topics = (req.query.topics ? String(req.query.topics).split(",") : TOPICS).filter((t) => bank[t]);
  const n = Math.min(Math.max(parseInt(req.query.n) || 10, 1), 100);
  const student = getStudent(String(req.query.studentId || ""));
  const recommended = recommendedDifficulty(student);
  const chosen = DIFFS.includes(req.query.difficulty) ? req.query.difficulty : null; // otherwise auto
  const difficulty = chosen || recommended;
  const targetIdx = DIFFS.indexOf(difficulty);
  const mix = chosen ? DIFFS.map((d) => (d === chosen ? 1 : 0)) : AUTO_MIX[recommended];
  const pool = topics.flatMap((t) => bank[t].map((q) => ({ ...q, topic: t })));
  const picked = pickByDifficulty(pool, n, mix, targetIdx);
  const testId = randomUUID();
  sessions.set(testId, { questions: picked, difficulty, mode: chosen ? "manual" : "auto", created: Date.now() });
  for (const [id, s] of sessions) if (Date.now() - s.created > 2 * 3600e3) sessions.delete(id);
  res.json({
    testId, difficulty, mode: chosen ? "manual" : "auto", recommended,
    questions: picked.map((q, i) => ({ id: i, topic: q.topic, difficulty: q.difficulty, q: q.q, hindi: q.hindi, stype: q.stype, sdetail: q.sdetail, options: shuffle(q.options) })),
  });
});

app.post("/api/test/submit", requireStudent, (req, res) => {
  const { testId, answers = {} } = req.body;
  const s = sessions.get(testId);
  if (!s) return res.status(404).json({ error: "Test expired or not found" });
  sessions.delete(testId);
  const byTopic = {};
  const byDifficulty = {};
  const review = s.questions.map((q, i) => {
    const given = answers[i] ?? null;
    const correct = given === q.answer;
    byTopic[q.topic] ??= { correct: 0, total: 0 };
    byTopic[q.topic].total++;
    byDifficulty[q.difficulty] ??= { correct: 0, total: 0 };
    byDifficulty[q.difficulty].total++;
    if (correct) { byTopic[q.topic].correct++; byDifficulty[q.difficulty].correct++; }
    return { id: i, topic: q.topic, difficulty: q.difficulty, q: q.q, hindi: q.hindi, stype: q.stype, sdetail: q.sdetail, given, answer: q.answer, correct, explain: q.explain };
  });
  const score = review.filter((r) => r.correct).length;
  const result = {
    studentId: req.student.id, name: req.student.name, date: new Date().toISOString(),
    score, total: review.length, difficulty: s.difficulty, mode: s.mode, byTopic, byDifficulty,
  };
  const all = readJson(RESULTS_FILE, []);
  all.push(result);
  writeJson(RESULTS_FILE, all);
  track(req.student.id, "t");
  res.json({ ...result, review });
});

app.get("/api/results", requireStudent, (req, res) => {
  res.json(readJson(RESULTS_FILE, []).filter((r) => r.studentId === req.student.id).slice(-20).reverse());
});

// ---- Hindi → English Writing Test ----
const trSessions = new Map();

const TR_EVAL_SYSTEM = `You are an English grammar examiner. A student translated Hindi sentences to English.
For each item, evaluate the student's translation:
  - Score 2: meaning correct AND grammar/tense fully correct
  - Score 1: meaning roughly correct but grammar or tense errors present
  - Score 0: wrong meaning, blank, or completely incorrect

Return ONLY a valid JSON array of exactly N objects (no markdown fences):
[{"score": 0|1|2, "feedback": string (1-2 sentences on what was right/wrong, focus on tense and grammar)}]`;

app.get("/api/translate-test", requireStudent, (req, res) => {
  const n = Math.min(Math.max(parseInt(req.query.n) || 5, 1), 15);
  const diff = req.query.difficulty;
  const pool = DIFFS.includes(diff) ? hindiBank.filter((s) => s.difficulty === diff) : hindiBank;
  const picked = shuffle(pool).slice(0, n);
  const testId = randomUUID();
  trSessions.set(testId, { questions: picked, created: Date.now() });
  for (const [id, s] of trSessions) if (Date.now() - s.created > 2 * 3600e3) trSessions.delete(id);
  res.json({ testId, questions: picked.map((q, i) => ({ id: i, hindi: q.hindi, tense: q.tense, difficulty: q.difficulty })) });
});

app.post("/api/translate-test/submit", requireStudent, wrap(async (req, res) => {
  const { testId, answers = {} } = req.body;
  const session = trSessions.get(testId);
  if (!session) return res.status(404).json({ error: "Test session not found or expired." });
  trSessions.delete(testId);

  const evalMsg = session.questions.map((q, i) =>
    `${i + 1}. Hindi: "${q.hindi}"\n   Tense/Grammar: ${q.tense}\n   Expected: "${q.english}"\n   Student wrote: "${String(answers[i] || "").trim() || "(no answer)"}"`
  ).join("\n\n");

  const rawEval = parseJson(await askAI(TR_EVAL_SYSTEM + `\n\nN=${session.questions.length}`, [{ role: "user", content: evalMsg }], 1200));
  const evalArr = Array.isArray(rawEval) ? rawEval : Object.values(rawEval);

  const review = session.questions.map((q, i) => {
    const e = evalArr[i] || { score: 0, feedback: "" };
    return { id: i, hindi: q.hindi, expected: q.english, tense: q.tense, difficulty: q.difficulty, given: String(answers[i] || "").trim(), score: e.score ?? 0, feedback: e.feedback || "" };
  });

  const score = review.reduce((s, r) => s + r.score, 0);
  const maxScore = review.length * 2;
  const result = { studentId: req.student.id, name: req.student.name, date: new Date().toISOString(), score, maxScore, total: review.length };
  const all = readJson(TR_RESULTS_FILE, []);
  all.push(result);
  writeJson(TR_RESULTS_FILE, all);
  track(req.student.id, "h");
  res.json({ ...result, percentage: Math.round((score / maxScore) * 100), review });
}));

app.get("/api/tr-results", requireStudent, (req, res) => {
  res.json(readJson(TR_RESULTS_FILE, []).filter((r) => r.studentId === req.student.id).slice(-20).reverse());
});

// ---- AI presentation generator ----
const PRESENTATION_GEN_SYSTEM = `You are an English presentation coach. The user gives you a short topic (2-5 words). Generate a clear, structured presentation plan they can use to practise English speaking.

Return ONLY valid JSON (no markdown fences):
{
  "title": string,
  "minutes": number,
  "ideas": [string],
  "opener": string,
  "keyVocab": [string],
  "structure": {"intro": string, "body": string, "conclusion": string}
}

Rules:
- ideas: 4-5 key points, each short and clear (one line)
- opener: a strong, natural first sentence a student can say aloud
- keyVocab: 5-6 useful words or phrases specific to this topic
- minutes: 3-5 depending on how much to cover
- structure: one short sentence each describing intro, body and conclusion`;

app.post("/api/presentation/generate", requireStudent, wrap(async (req, res) => {
  const topic = String(req.body.topic || "").trim().slice(0, 100);
  if (!topic) return res.status(400).json({ error: "topic required" });
  const wordLimit = [50, 100, 150, 200, 300, 500].includes(Number(req.body.wordLimit)) ? Number(req.body.wordLimit) : 0;
  const userContent = wordLimit
    ? `Topic: ${topic}\nWord limit: approximately ${wordLimit} words total (set "minutes" accordingly at ~130 words per minute)`
    : topic;
  const result = parseJson(await askAI(PRESENTATION_GEN_SYSTEM, [{ role: "user", content: userContent }], 900));
  res.json({ ...result, wordLimit: wordLimit || null });
}));

// ---- Daily usage: what each student did on each day (one small file per day) ----
// Short field names keep the files tiny: s seconds on site, l sign-ins, m Speak messages, t grammar tests,
// h Hindi writing tests, g grammar checks, d dictionary searches, c group-chat messages.
let USAGE_TZ = process.env.ADMIN_TZ || "Asia/Kolkata"; // the time zone that decides where a "day" starts
let dayFormat;
try { dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: USAGE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }); }
catch { USAGE_TZ = "UTC"; dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }); }
const dayKey = (d = new Date()) => dayFormat.format(d); // "2026-10-09"
const usageFile = (day) => path.join(DATA_DIR, "usage", `${day}.json`);

function track(studentId, field, amount = 1) {
  if (!studentId || !(amount > 0)) return;
  try {
    const file = usageFile(dayKey());
    const rows = readJson(file, {});
    const row = (rows[studentId] ??= {});
    row[field] = Math.round(((row[field] || 0) + amount) * 10) / 10;
    writeJson(file, rows);
  } catch (e) { console.error("Could not record usage:", e.message); } // never break the student's request
}

// The first time this runs, rebuild past days from data that already has dates (tests, chats, searches...).
// Time on site was never recorded per day before, so it only counts from now on.
function backfillUsage() {
  const marker = path.join(DATA_DIR, "usage", "backfill.json");
  if (readJson(marker, null)) return;
  const acc = {};
  const bump = (iso, id, field) => {
    const t = new Date(iso);
    if (!id || isNaN(t)) return;
    const row = ((acc[dayKey(t)] ??= {})[id] ??= {});
    row[field] = (row[field] || 0) + 1;
  };
  const students = readJson(STUDENTS_FILE, {});
  for (const s of Object.values(students)) bump(s.created, s.id, "l");
  for (const r of readJson(RESULTS_FILE, [])) bump(r.date, r.studentId, "t");
  for (const r of readJson(TR_RESULTS_FILE, [])) bump(r.date, r.studentId, "h");
  for (const g of readJson(GRAMMAR_CHECKS_FILE, [])) bump(g.at, g.studentId, "g");
  for (const x of readJson(SEARCHES_FILE, [])) bump(x.at, x.studentId, "d");
  for (const id of Object.keys(students)) for (const m of readJson(chatFile(id), [])) if (m.role === "user") bump(m.at, id, "m");
  for (const room of Object.values(readJson(GC_FILE, { rooms: {} }).rooms || {})) for (const m of room) if (!m.admin) bump(m.at, m.studentId, "c");
  for (const [day, rows] of Object.entries(acc)) writeJson(usageFile(day), { ...rows, ...readJson(usageFile(day), {}) });
  writeJson(marker, { done: true, at: new Date().toISOString(), days: Object.keys(acc).length });
  console.log(`Rebuilt daily usage for ${Object.keys(acc).length} past day(s) from saved data.`);
}

function lastDays(n) { // today and the n-1 days before it, oldest first
  const seen = new Set(), out = [];
  for (let i = n - 1; i >= 0; i--) { const k = dayKey(new Date(Date.now() - i * 86400e3)); if (!seen.has(k)) { seen.add(k); out.push(k); } }
  return out;
}
const usageTotals = (r) => ({ seconds: Math.round(r.s || 0), logins: r.l || 0, messages: r.m || 0, tests: r.t || 0, trTests: r.h || 0, grammar: r.g || 0, searches: r.d || 0, chat: r.c || 0 });

// Day-by-day totals for the last N days, for everyone or for one student (?student=<id>).
app.get("/api/admin/usage", requireAdmin, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const only = String(req.query.student || "");
  const out = lastDays(days).map((date) => {
    const rows = readJson(usageFile(date), {});
    const sum = { date, activeUsers: 0, seconds: 0, logins: 0, messages: 0, tests: 0, trTests: 0, grammar: 0, searches: 0, chat: 0 };
    for (const [id, r] of Object.entries(rows)) {
      if (only && id !== only) continue;
      const t = usageTotals(r);
      sum.activeUsers++;
      for (const k of Object.keys(t)) sum[k] += t[k];
    }
    return sum;
  });
  const students = Object.values(readJson(STUDENTS_FILE, {})).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ tz: USAGE_TZ, today: dayKey(), days: out, students });
});

// Who was active on one day, and what each of them did.
app.get("/api/admin/usage/:date", requireAdmin, (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: "Use a date like 2026-10-09." });
  const students = readJson(STUDENTS_FILE, {});
  const list = Object.entries(readJson(usageFile(req.params.date), {}))
    .map(([id, r]) => ({ id, name: students[id]?.name || id, ...usageTotals(r) }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  res.json({ date: req.params.date, students: list });
});

// ---- Access control: block a student, or limit their time each day ----
// student.blocked / blockReason: locked out completely.
// student.dailyLimitMin: minutes allowed per day. Not set = follow the default; 0 = no limit for this student.
// student.extra: { day, seconds } extra time granted by the admin for one day.
// settings.defaultDailyLimitMin: the limit for students who have none of their own (0 = no limit).
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const getSettings = () => ({ defaultDailyLimitMin: 0, ...readJson(SETTINGS_FILE, {}) });
const minutesText = (sec) => { const m = Math.round(sec / 60); return m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minute${m === 1 ? "" : "s"}`; };

function secondsUntilTomorrow() { // until midnight in the admin's time zone, when the day's time starts again
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: USAGE_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const n = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return Math.max(60, 86400 - (n("hour") * 3600 + n("minute") * 60 + n("second")));
}
function accessState(student, usageToday = readJson(usageFile(dayKey()), {})) {
  const used = Math.round(usageToday[student.id]?.s || 0);
  if (student.blocked) return { code: "blocked", used, limit: null, remaining: null, message: student.blockReason || "Your access to Speakeasy Academy has been paused. Please contact your teacher." };
  const minutes = student.dailyLimitMin ?? getSettings().defaultDailyLimitMin;
  if (!(minutes > 0)) return { code: "ok", used, limit: null, remaining: null };
  const limit = minutes * 60 + (student.extra?.day === dayKey() ? student.extra.seconds : 0);
  const remaining = Math.max(0, limit - used);
  if (remaining > 0) return { code: "ok", used, limit, remaining };
  return { code: "limit", used, limit, remaining: 0, resumeInSeconds: secondsUntilTomorrow(), message: `You have used your ${minutesText(limit)} for today. Well done! Your time starts again tomorrow.` };
}
const publicAccess = ({ code, message, used, limit, remaining, resumeInSeconds }) => ({ code, message, used, limit, remaining, resumeInSeconds });

// A student asks "can I use the app right now?" (works even when locked, so the page can show why).
app.get("/api/students/:id/status", allowLocked, requireStudent, (req, res) => {
  res.json({ access: publicAccess(req.access), student: publicStudent(req.student) });
});

// Admin: block / unblock, set the student's own daily limit, or grant extra minutes for today.
app.post("/api/admin/students/:id/access", requireAdmin, (req, res) => {
  const students = readJson(STUDENTS_FILE, {});
  const s = students[req.params.id];
  if (!s) return res.status(404).json({ error: "Unknown student" });
  const b = req.body || {};
  if (typeof b.blocked === "boolean") { s.blocked = b.blocked; if (!b.blocked) delete s.blockReason; }
  if (typeof b.blockReason === "string" && s.blocked) { const r = b.blockReason.trim().slice(0, 200); if (r) s.blockReason = r; else delete s.blockReason; }
  if ("dailyLimitMin" in b) {
    if (b.dailyLimitMin === null || b.dailyLimitMin === "") delete s.dailyLimitMin;
    else {
      const n = Math.round(Number(b.dailyLimitMin));
      if (!Number.isFinite(n) || n < 0 || n > 1440) return res.status(400).json({ error: "The daily limit must be between 0 and 1440 minutes (0 means no limit)." });
      s.dailyLimitMin = n;
    }
  }
  if (b.clearExtra === true) delete s.extra;
  const add = Number(b.addMinutesToday);
  if (add > 0) {
    if (add > 240) return res.status(400).json({ error: "You can add up to 240 minutes at a time." });
    const day = dayKey();
    s.extra = { day, seconds: (s.extra?.day === day ? s.extra.seconds : 0) + Math.round(add * 60) };
  }
  writeJson(STUDENTS_FILE, students);
  res.json({ ok: true, access: publicAccess(accessState(s)) });
});

// Admin: the daily limit for everyone who has none of their own (0 = no limit).
app.post("/api/admin/settings", requireAdmin, (req, res) => {
  const n = Math.round(Number(req.body?.defaultDailyLimitMin));
  if (!Number.isFinite(n) || n < 0 || n > 1440) return res.status(400).json({ error: "The default limit must be between 0 and 1440 minutes (0 means no limit)." });
  writeJson(SETTINGS_FILE, { ...getSettings(), defaultDailyLimitMin: n });
  res.json(getSettings());
});

// ---- Shayari: learn couplets and English quotes, and share your own ----
// Content (poets, couplets, quotes) is a file in the repository. What students write lives in shayari_wall.json.
const shayariBank = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "shayari.json"), "utf8"));
const SH_FILE = path.join(DATA_DIR, "shayari_wall.json");
const SH_TYPES = shayariBank.types;
const SH_LANGS = ["Hindi", "Urdu", "Roman", "English"];
const SH_KINDS = ["wah", "heart"];
const SH_MAX = 500;
const SH_ITEM_KEYS = new Set([...shayariBank.sher.map((s) => "s" + s.id), ...shayariBank.quotes.map((q) => "q" + q.id)]);
const shLastPost = new Map();
const shLoad = () => readJson(SH_FILE, { nextId: 1, posts: [], items: {} });
const shView = (p, viewerId) => ({
  id: p.id, name: p.name, text: p.text, type: p.type || p.mood || "Life", lang: p.lang, at: p.at, mine: p.studentId === viewerId,
  wah: (p.wah || []).length, heart: (p.heart || []).length, iWah: (p.wah || []).includes(viewerId), iHeart: (p.heart || []).includes(viewerId),
});

// The couplets, quotes and notes are the same for everyone, so no sign-in is needed to read them.
app.get("/api/shayari", (_req, res) => res.json(shayariBank));

// Reactions on the built-in couplets and quotes: { s1: { wah, heart, iWah, iHeart }, q3: ... }
app.get("/api/shayari/reactions", requireStudent, (req, res) => {
  const items = shLoad().items || {};
  const out = {};
  for (const [key, r] of Object.entries(items)) {
    const wah = r.wah || [], heart = r.heart || [];
    if (wah.length || heart.length) out[key] = { wah: wah.length, heart: heart.length, iWah: wah.includes(req.student.id), iHeart: heart.includes(req.student.id) };
  }
  res.json(out);
});
app.post("/api/shayari/items/:key/react", requireStudent, (req, res) => {
  const key = req.params.key, kind = String(req.body.kind || "");
  if (!SH_ITEM_KEYS.has(key)) return res.status(404).json({ error: "Unknown shayari." });
  if (!SH_KINDS.includes(kind)) return res.status(400).json({ error: "That reaction is not available." });
  const data = shLoad();
  data.items ??= {};
  const r = (data.items[key] ??= {});
  const who = (r[kind] ??= []);
  const i = who.indexOf(req.student.id);
  if (i >= 0) who.splice(i, 1); else who.push(req.student.id);
  writeJson(SH_FILE, data);
  const wah = r.wah || [], heart = r.heart || [];
  res.json({ wah: wah.length, heart: heart.length, iWah: wah.includes(req.student.id), iHeart: heart.includes(req.student.id) });
});

// The community wall. ?mine=1 shows only your own; ?type=Love shows one type.
app.get("/api/shayari/posts", requireStudent, (req, res) => {
  let posts = shLoad().posts;
  if (req.query.mine === "1") posts = posts.filter((p) => p.studentId === req.student.id);
  if (SH_TYPES.includes(req.query.type)) posts = posts.filter((p) => (p.type || p.mood) === req.query.type);
  res.json(posts.slice(-100).reverse().map((p) => shView(p, req.student.id)));
});

app.post("/api/shayari/posts", requireStudent, (req, res) => {
  if (req.student.chatMuted) return res.status(403).json({ error: "You have been muted by the admin and cannot post." });
  const text = String(req.body.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 400);
  if (text.length < 8) return res.status(400).json({ error: "Write at least a line of shayari first." });
  if (/(https?:\/\/|www\.)/i.test(text)) return res.status(400).json({ error: "Links are not allowed." });
  if (Date.now() - (shLastPost.get(req.student.id) || 0) < 15000) return res.status(429).json({ error: "Please wait a few seconds before posting again." });
  shLastPost.set(req.student.id, Date.now());
  const data = shLoad();
  const post = {
    id: data.nextId++, studentId: req.student.id, name: req.student.name, text,
    type: SH_TYPES.includes(req.body.type) ? req.body.type : "Life",
    lang: SH_LANGS.includes(req.body.lang) ? req.body.lang : "Roman",
    at: new Date().toISOString(),
  };
  data.posts = [...data.posts, post].slice(-SH_MAX);
  writeJson(SH_FILE, data);
  res.json(shView(post, req.student.id));
});

// "Wah wah!" or a heart; sending the same one again takes it back. (:pid, because requireStudent reads :id as a student id.)
app.post("/api/shayari/posts/:pid/react", requireStudent, (req, res) => {
  const kind = String(req.body.kind || "");
  if (!SH_KINDS.includes(kind)) return res.status(400).json({ error: "That reaction is not available." });
  const data = shLoad();
  const post = data.posts.find((p) => p.id === parseInt(req.params.pid, 10));
  if (!post) return res.status(404).json({ error: "That shayari no longer exists." });
  const who = (post[kind] ??= []);
  const i = who.indexOf(req.student.id);
  if (i >= 0) who.splice(i, 1); else who.push(req.student.id);
  writeJson(SH_FILE, data);
  res.json(shView(post, req.student.id));
});

app.delete("/api/shayari/posts/:pid", requireStudent, (req, res) => {
  const data = shLoad();
  const post = data.posts.find((p) => p.id === parseInt(req.params.pid, 10));
  if (!post) return res.status(404).json({ error: "That shayari no longer exists." });
  if (post.studentId !== req.student.id) return res.status(403).json({ error: "You can only delete your own shayari." });
  data.posts = data.posts.filter((p) => p !== post);
  writeJson(SH_FILE, data);
  res.json({ ok: true });
});

app.get("/api/admin/shayari", requireAdmin, (_req, res) => {
  res.json(shLoad().posts.slice(-100).reverse().map(({ id, name, text, type, mood, lang, at, wah = [], heart = [] }) => ({ id, name, text, type: type || mood || "Life", lang, at, wah: wah.length, heart: heart.length })));
});
app.delete("/api/admin/shayari/:pid", requireAdmin, (req, res) => {
  const data = shLoad();
  data.posts = data.posts.filter((p) => p.id !== parseInt(req.params.pid, 10));
  writeJson(SH_FILE, data);
  res.json({ ok: true });
});

// ---- Enquiries: a visitor asks a question; it is saved for the admin and emailed if SMTP is set up ----
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");
const enquiryTimes = new Map(); // ip -> times of recent enquiries (simple spam limit)
const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;
const smtpReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function emailEnquiry(e) {
  if (!smtpReady()) return false;
  const to = (process.env.ENQUIRY_TO || process.env.SMTP_USER).split(",").map((x) => x.trim()).filter(Boolean);
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED !== "true" },
  });
  await transport.sendMail({
    from: process.env.ENQUIRY_FROM || `Speakeasy Academy <${process.env.SMTP_USER}>`,
    to, replyTo: `${e.name.replace(/[<>"\r\n]/g, "")} <${e.email}>`,
    subject: `New enquiry from ${e.name.replace(/[\r\n]/g, " ").slice(0, 60)}`,
    text: `Name: ${e.name}\nEmail: ${e.email}\nPhone: ${e.phone || "-"}\nSigned-in student: ${e.studentName || "-"}\nReceived: ${e.at}\n\n${e.message}\n`,
  });
  return true;
}

app.post("/api/enquiry", wrap(async (req, res) => {
  if (String(req.body.website || "").trim()) return res.json({ ok: true }); // hidden field: only bots fill it in
  const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120), phone = clean(req.body.phone, 25), message = clean(req.body.message, 2000);
  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address so we can reply." });
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!PHONE_RE.test(phone) || digits.length < 7 || digits.length > 15) return res.status(400).json({ error: "Please enter a valid phone number, or leave it blank." });
  }
  if (message.length < 5) return res.status(400).json({ error: "Please write your question (at least a few words)." });
  const now = Date.now(), recent = (enquiryTimes.get(req.ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 5 || (recent.length && now - recent[recent.length - 1] < 15000)) return res.status(429).json({ error: "Please wait a little before sending another enquiry." });
  enquiryTimes.set(req.ip, [...recent, now]);
  const student = getStudent(String(req.body.studentId || ""));
  const all = readJson(ENQUIRIES_FILE, []);
  const recentSameEmail = all.filter(e => e.email === email && Date.now() - new Date(e.at).getTime() < 1800000);
  if (recentSameEmail.length >= 2) return res.status(429).json({ error: "You've already sent an enquiry from this email recently. We'll get back to you soon!" });
  const record = { id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1, name, email, phone, message, studentName: student?.name || "", at: new Date().toISOString(), status: "new", emailed: false };
  all.push(record);
  writeJson(ENQUIRIES_FILE, all.slice(-1000));
  // Saved first, so nothing is lost if email fails; the email is sent in the background.
  emailEnquiry(record).then((sent) => {
    if (!sent) return;
    const list = readJson(ENQUIRIES_FILE, []); const r = list.find((x) => x.id === record.id);
    if (r) { r.emailed = true; writeJson(ENQUIRIES_FILE, list); }
  }).catch((e) => console.error("Could not email the enquiry:", e.message));
  res.json({ ok: true });
}));

app.get("/api/admin/enquiries", requireAdmin, (_req, res) => {
  res.json({ emailOn: smtpReady(), enquiries: readJson(ENQUIRIES_FILE, []).slice().reverse().slice(0, 200) });
});
app.post("/api/admin/enquiries/:eid/status", requireAdmin, (req, res) => {
  const all = readJson(ENQUIRIES_FILE, []); const e = all.find((x) => x.id === parseInt(req.params.eid, 10));
  if (!e) return res.status(404).json({ error: "Enquiry not found" });
  e.status = req.body.status === "done" ? "done" : "new";
  writeJson(ENQUIRIES_FILE, all);
  res.json({ ok: true, status: e.status });
});
app.delete("/api/admin/enquiries/:eid", requireAdmin, (req, res) => {
  writeJson(ENQUIRIES_FILE, readJson(ENQUIRIES_FILE, []).filter((x) => x.id !== parseInt(req.params.eid, 10)));
  res.json({ ok: true });
});

// ---- Fallbacks (must stay AFTER every API route) ----
// Unknown /api/... paths get a JSON 404 instead of the web page.
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
// Any other GET (a refreshed or bookmarked URL) returns the app's index.html.
app.use((req, res, next) => {
  if (req.method !== "GET" || !FRONTEND_INDEX) return next();
  res.sendFile(FRONTEND_INDEX);
});

await initStore({ dataDir: DATA_DIR, databaseUrl: process.env.DATABASE_URL, mongoUrl: process.env.MONGODB_URL || process.env.MONGODB_URI });
backfillUsage();
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => { await flushStore().catch(() => {}); process.exit(0); }); // save pending changes before Render restarts us

app.listen(PORT, "0.0.0.0", () => {
  console.log(`English App listening on port ${PORT} (http://localhost:${PORT} when running locally)`);
  if (!client) console.log("Note: OPENAI_API_KEY not set - Speak and Grammar tabs need it; Test works without.");
});
