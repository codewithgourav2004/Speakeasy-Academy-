import express from "express";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local development: load backend/.env. On Render the variables come from the dashboard
// (dotenv never overrides variables that are already set, and a missing .env is fine).
dotenv.config({ path: path.join(__dirname, ".env") });
const PORT = process.env.PORT || 5000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const RESULTS_FILE = path.join(__dirname, "data", "results.json");
const SEARCHES_FILE = path.join(__dirname, "data", "searches.json");
const TR_RESULTS_FILE = path.join(__dirname, "data", "tr_results.json");
const GRAMMAR_CHECKS_FILE = path.join(__dirname, "data", "grammar_checks.json");
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "questions.json"), "utf8"));
const TOPICS = Object.keys(bank);
const hindiBank = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "hindi_sentences.json"), "utf8"));

// Works with any OpenAI-compatible provider (OpenAI, Groq, Gemini, OpenRouter, Ollama) via OPENAI_BASE_URL.
// maxRetries 0 + a timeout so an overloaded model fails fast and the fallback model can take over.
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined, maxRetries: 0, timeout: 30000 })
  : null;
const app = express();
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
  const call = (model) => client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages],
  });
  try {
    return (await call(MODEL)).choices[0].message.content || "";
  } catch (e) {
    // Overloaded (429/5xx), timed out or unreachable: try the backup model once.
    const transient = !e.status || e.status === 429 || e.status >= 500;
    if (!FALLBACK_MODEL || FALLBACK_MODEL === MODEL || !transient) throw e;
    console.warn(`${MODEL} failed (${e.status || e.name}); retrying with ${FALLBACK_MODEL}`);
    return (await call(FALLBACK_MODEL)).choices[0].message.content || "";
  }
}

function parseJson(text) {
  const oi = text.indexOf("{"), ai = text.indexOf("[");
  const start = oi < 0 ? ai : ai < 0 ? oi : Math.min(oi, ai);
  if (start < 0) throw new Error("Model did not return JSON");
  const close = text[start] === "[" ? text.lastIndexOf("]") : text.lastIndexOf("}");
  if (close < start) throw new Error("Model did not return JSON");
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
const DATA_DIR = path.join(__dirname, "data");
const CHAT_DIR = path.join(DATA_DIR, "chats");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
fs.mkdirSync(CHAT_DIR, { recursive: true });

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
  req.student = student;
  next();
}

app.post("/api/login", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  const id = slug(name);
  if (!id) return res.status(400).json({ error: "Please enter your name (letters or numbers)." });
  const age = Number.parseInt(req.body.age, 10);
  if (!Number.isInteger(age) || age < 3 || age > 100) return res.status(400).json({ error: "Please enter a valid age (3-100)." });
  const students = readJson(STUDENTS_FILE, {});
  const now = new Date().toISOString();
  const isNew = !students[id];
  students[id] ??= { id, name, level: "intermediate", created: now };
  students[id].age = age;
  students[id].visits = (students[id].visits || 0) + 1;
  if (LEVELS.includes(req.body.level)) students[id].level = req.body.level;
  students[id].lastSeen = now;
  writeJson(STUDENTS_FILE, students);
  res.json({ student: students[id], isNew });
});

// Heartbeat: credits active time. Credit is capped by real elapsed time since the last ping.
app.post("/api/students/:id/ping", requireStudent, (req, res) => {
  const students = readJson(STUDENTS_FILE, {});
  const s = students[req.student.id];
  const now = Date.now();
  const elapsed = s.lastPing ? (now - s.lastPing) / 1000 : Infinity;
  const asked = Math.max(0, Math.min(Number(req.body.seconds) || 0, 60));
  // First ping, or one after a long gap (tab closed): credit at most one heartbeat interval.
  const credit = elapsed < 120 ? Math.min(asked, elapsed) : Math.min(asked, 15);
  s.timeSpent = Math.round(((s.timeSpent || 0) + credit) * 10) / 10;
  s.lastPing = now;
  s.lastSeen = new Date(now).toISOString();
  writeJson(STUDENTS_FILE, students);
  res.json({ ok: true });
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

  const users = students.map((s) => {
    const mine = results.filter((r) => r.studentId === s.id);
    const q = mine.reduce((n, r) => n + r.total, 0);
    const chat = readJson(chatFile(s.id), []);
    const tr = trByStudent[s.id];
    return {
      id: s.id, name: s.name, age: s.age ?? null, level: s.level, created: s.created, lastSeen: s.lastSeen, visits: s.visits || 1,
      timeSpent: Math.round(s.timeSpent || 0),
      messages: chat.filter((m) => m.role === "user").length,
      tests: mine.length,
      avgScore: q ? Math.round((mine.reduce((n, r) => n + r.score, 0) / q) * 100) : null,
      searches: searchesByStudent[s.id] || 0,
      trTests: tr?.count || 0,
      trAvgScore: tr ? Math.round(tr.totalPct / tr.count) : null,
      grammarChecks: grammarByStudent[s.id] || 0,
      chatMuted: !!s.chatMuted,
    };
  }).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

  const ages = users.map((u) => u.age).filter((a) => a != null);
  const groups = { "Under 13": 0, "13-17": 0, "18-25": 0, "26-40": 0, "41+": 0 };
  for (const a of ages) groups[a < 13 ? "Under 13" : a <= 17 ? "13-17" : a <= 25 ? "18-25" : a <= 40 ? "26-40" : "41+"]++;

  const wordCounts = {};
  for (const s of searches) wordCounts[s.word] = (wordCounts[s.word] || 0) + 1;
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
  const recentSearches = searches.slice(-50).reverse().map(({ name, word, at }) => ({ name, word, at }));

  res.json({
    totalUsers: students.length,
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
    users,
  });
});

app.get("/api/admin/users/:id/tests", requireAdmin, (req, res) => {
  const id = req.params.id;
  const mcq = readJson(RESULTS_FILE, []).filter((r) => r.studentId === id);
  const tr = readJson(TR_RESULTS_FILE, []).filter((r) => r.studentId === id);
  const grammar = readJson(GRAMMAR_CHECKS_FILE, []).filter((r) => r.studentId === id);
  res.json({ mcq, tr, grammar });
});

app.get("/api/students/:id/grammar-history", requireStudent, (req, res) => {
  res.json(readJson(GRAMMAR_CHECKS_FILE, []).filter((r) => r.studentId === req.student.id).slice(-30).reverse());
});

app.get("/api/students/:id/chat", requireStudent, (req, res) => res.json(readJson(chatFile(req.student.id), [])));

app.delete("/api/students/:id/chat", requireStudent, (req, res) => {
  fs.rmSync(chatFile(req.student.id), { force: true });
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
    student: req.student,
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

app.post("/api/grammar", wrap(async (req, res) => {
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

app.post("/api/translate", wrap(async (req, res) => {
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

function requireRoom(req, res, next) {
  if (!GC_ROOMS[req.params.room]) return res.status(404).json({ error: "Unknown room" });
  next();
}

app.get("/api/groupchat/:room", requireRoom, requireStudent, (req, res) => {
  const data = gcLoad();
  const msgs = data.rooms[req.params.room] || [];
  const after = parseInt(req.query.after, 10) || 0;
  const recent = msgs.slice(-100);
  const isOnline = (s) => Date.now() - new Date(s.lastSeen).getTime() < 60000;
  // Members: names only (never age, level or id), online people first.
  const members = Object.values(readJson(STUDENTS_FILE, {}))
    .map((s) => ({ name: s.name, online: isOnline(s) }))
    .sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
  res.json({
    messages: after ? recent.filter((m) => m.id > after) : recent.slice(-50),
    ids: recent.map((m) => m.id), // lets pages drop messages an admin deleted
    online: members.filter((m) => m.online).length,
    members,
    enabled: data.enabled !== false,
    muted: !!req.student.chatMuted,
  });
});

app.post("/api/groupchat/:room", requireRoom, requireStudent, (req, res) => {
  if (gcLoad().enabled === false) return res.status(403).json({ error: "Group chat is switched off by the admin." });
  if (req.student.chatMuted) return res.status(403).json({ error: "You have been muted by the admin and cannot send messages." });
  const text = String(req.body.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "Write a message first." });
  if (/(https?:\/\/|www\.)/i.test(text)) return res.status(400).json({ error: "Links are not allowed in the group chat." });
  const last = gcLastPost.get(req.student.id) || 0;
  if (Date.now() - last < 1000) return res.status(429).json({ error: "You're sending messages too fast. Wait a second." });
  gcLastPost.set(req.student.id, Date.now());
  const data = gcLoad();
  const msg = { id: data.nextId++, studentId: req.student.id, name: req.student.name, text, at: new Date().toISOString() };
  data.rooms[req.params.room] = [...(data.rooms[req.params.room] || []), msg].slice(-GC_MAX_PER_ROOM);
  writeJson(GC_FILE, data);
  res.json(msg);
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

app.delete("/api/groupchat/:room/:id", requireRoom, requireAdmin, (req, res) => {
  const data = gcLoad();
  const id = parseInt(req.params.id, 10);
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
  const all = fs.existsSync(RESULTS_FILE) ? JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8")) : [];
  all.push(result);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(all, null, 2));
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
  res.json({ ...result, percentage: Math.round((score / maxScore) * 100), review });
}));

app.get("/api/tr-results", requireStudent, (req, res) => {
  res.json(readJson(TR_RESULTS_FILE, []).filter((r) => r.studentId === req.student.id).slice(-20).reverse());
});

// ---- Fallbacks (must stay AFTER every API route) ----
// Unknown /api/... paths get a JSON 404 instead of the web page.
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
// Any other GET (a refreshed or bookmarked URL) returns the app's index.html.
app.use((req, res, next) => {
  if (req.method !== "GET" || !FRONTEND_INDEX) return next();
  res.sendFile(FRONTEND_INDEX);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`English App listening on port ${PORT} (http://localhost:${PORT} when running locally)`);
  if (!client) console.log("Note: OPENAI_API_KEY not set - Speak and Grammar tabs need it; Test works without.");
});
