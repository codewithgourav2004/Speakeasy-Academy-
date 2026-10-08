const $ = (s) => document.querySelector(s);

// ---- Theme ----
(function () {
  const root = document.documentElement;
  const btn = document.getElementById("themeBtn");
  const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const saved = localStorage.getItem("theme");
  const isDark = () => (saved ? root.dataset.theme === "dark" : systemDark());
  if (saved) root.dataset.theme = saved;
  const update = () => { btn.textContent = isDark() ? "☀️" : "🌙"; };
  update();
  btn.onclick = () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    update();
  };
})();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LABELS = { tense: "Tenses", modals: "Modals", passive: "Passive voice", narration: "Narration", nonfinites: "Non-finites",
  articles: "Articles", prepositions: "Prepositions", conditionals: "Conditionals", agreement: "Subject-verb agreement",
  relatives: "Relative clauses", comparison: "Comparison", conjunctions: "Conjunctions", tags: "Question tags",
  translation: "Hindi → English" };

async function api(path, body, method) {
  const res = await fetch(path, body ? { method: method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) showWelcome(data.error);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---- Student profile (saved by name) ----
let student = null;
try { student = JSON.parse(localStorage.getItem("student")); } catch {}

// Forced sign-in (nobody is signed in, or the server no longer knows the student): cannot be dismissed.
function showWelcome(err = "") {
  student = null;
  localStorage.removeItem("student");
  $("#userChip").hidden = $("#logoutBtn").hidden = true;
  $("#welcomeClose").hidden = true;
  $("#welcomeErr").textContent = err;
  $("#welcome").hidden = false;
  $("#nameInput").focus();
}
// "Switch": the current student stays signed in until someone else signs in, so this can be cancelled.
function showSwitchUser() {
  $("#nameInput").value = "";
  $("#ageInput").value = "";
  $("#welcomeErr").textContent = "";
  $("#welcomeClose").hidden = false;
  $("#welcome").hidden = false;
  $("#nameInput").focus();
}
function closeWelcome() { if (student) $("#welcome").hidden = true; }
$("#welcomeClose").onclick = closeWelcome;
$("#welcome").addEventListener("mousedown", (e) => { if (e.target.id === "welcome") closeWelcome(); }); // click outside the box
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#welcome").hidden) closeWelcome(); });
async function enter(s) {
  student = s;
  localStorage.setItem("student", JSON.stringify(s));
  $("#welcome").hidden = true;
  $("#userChip").textContent = `👤 ${s.name}`;
  $("#userChip").hidden = $("#logoutBtn").hidden = false;
  await loadChat(true);
  const active = document.querySelector("nav button.active")?.dataset.tab;
  if (active === "test") loadTestSetup();
  if (active === "progress") loadProgress();
}
$("#welcomeForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const { student: s, isNew } = await api("/api/login", { name: $("#nameInput").value, age: $("#ageInput").value, level: $("#levelInput").value });
    await enter(s);
    if (!isNew) toast(`Welcome back, ${s.name}!`);
  } catch (err) {
    $("#welcomeErr").textContent = err.message;
  }
};
function logout() {
  student = null;
  localStorage.removeItem("student");
  adminKey = "";
  sessionStorage.removeItem("adminKey");
  $("#adminTab").hidden = true;
  $("#chatLog").innerHTML = "";
  showWelcome();
}
$("#logoutBtn").onclick = () => {
  if (confirm("Log out? You can log back in with your name at any time.")) logout();
};
function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

// ---- Tabs ----
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => {
  stopVoice(); // leaving a tab silences the voice
  document.querySelectorAll("nav button, .tab").forEach((e) => e.classList.remove("active"));
  b.classList.add("active");
  // Keep the active tab visible when the tab bar scrolls sideways (tablets). Only the bar moves, never the page.
  const bar = b.parentElement;
  if (bar.scrollWidth > bar.clientWidth + 1) {
    const nb = bar.getBoundingClientRect(), bb = b.getBoundingClientRect();
    bar.scrollBy({ left: bb.left - nb.left - (nb.width - bb.width) / 2, behavior: "smooth" });
  }
  $("#" + b.dataset.tab).classList.add("active");
  closeNav();
  if (!student) return;
  if (b.dataset.tab === "test") loadTestSetup();
  if (b.dataset.tab === "progress") loadProgress();
}));
// student-only tabs need a student; admin needs a key
function openTab(name) { document.querySelector(`nav button[data-tab="${name}"]`).click(); }

// ---- Mobile nav toggle ----
function closeNav() {
  document.body.classList.remove("nav-open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
  $("#menuToggle").textContent = "☰";
}
function openNav() {
  document.body.classList.add("nav-open");
  $("#menuToggle").setAttribute("aria-expanded", "true");
  $("#menuToggle").textContent = "✕";
}
$("#menuToggle").addEventListener("click", () => {
  document.body.classList.contains("nav-open") ? closeNav() : openNav();
});
$("#navOverlay").addEventListener("click", closeNav);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });

// ---- Speak ----
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
function addMsg(role, text, at, corrections = []) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  const body = document.createElement("div");
  body.textContent = text;
  const time = document.createElement("div");
  time.className = "time";
  time.textContent = fmtTime(at || new Date().toISOString());
  d.append(body, time);
  addFixes(d, corrections);
  $("#chatLog").append(d);
  $("#chatLog").scrollTop = 1e9;
  return d;
}
function addFixes(el, corrections) {
  for (const c of corrections) {
    const f = document.createElement("div");
    f.className = "fix";
    f.innerHTML = `<b>${esc(c.category)}</b>: <s>${esc(c.original)}</s> → <b>${esc(c.corrected)}</b><br>${esc(c.rule)}`;
    el.append(f);
  }
}
async function loadChat(replace) {
  const log = $("#chatLog");
  if (replace) log.innerHTML = "";
  try {
    const saved = await api(`/api/students/${student.id}/chat`);
    saved.forEach((m) => addMsg(m.role, m.content, m.at, m.corrections));
  } catch { return; }
  if (!log.children.length) {
    addMsg("assistant", `Hi ${student.name}! I'm your English coach. Tell me about your day, and I'll gently correct your grammar.`);
    const chips = document.createElement("div");
    chips.className = "starters";
    chips.innerHTML = ["Tell me about your day", "Let's talk about hobbies", "Help me practise past tense", "Ask me about my family"]
      .map((t) => `<button class="chipbtn">${esc(t)}</button>`).join("");
    chips.onclick = (e) => { if (e.target.matches(".chipbtn")) { chips.remove(); send(e.target.textContent); } };
    log.append(chips);
  }
}
$("#clearChat").onclick = async () => {
  if (!student || !confirm("Clear all chat messages? This cannot be undone. (Test scores are kept.)")) return;
  stopVoice();
  await api(`/api/students/${student.id}/chat`, undefined, "DELETE");
  loadChat(true);
};
// ---- Voice: every spoken reply goes through say(), and the Stop button is shown while it talks ----
const TTS_OK = "speechSynthesis" in window;
let currentUtterance = null;
function setVoiceBtn(on) { $("#stopVoice").hidden = !on; }
function stopVoice() {
  if (!TTS_OK) return;
  currentUtterance = null;
  speechSynthesis.cancel();
  setVoiceBtn(false);
}
function say(text, { force = false } = {}) {
  if (!TTS_OK || (!force && !$("#ttsToggle").checked)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  currentUtterance = u;
  u.onstart = () => { if (currentUtterance === u) setVoiceBtn(true); };
  // Ignore end events from an older utterance that was cancelled by a newer one.
  u.onend = u.onerror = () => { if (currentUtterance === u) { currentUtterance = null; setVoiceBtn(false); } };
  speechSynthesis.speak(u);
}
function speak(text) { say(text); }
$("#stopVoice").onclick = stopVoice;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") stopVoice(); });
try { $("#ttsToggle").checked = localStorage.getItem("tts") !== "off"; } catch {}
$("#ttsToggle").onchange = (e) => {
  try { localStorage.setItem("tts", e.target.checked ? "on" : "off"); } catch {}
  if (!e.target.checked) stopVoice();
};
async function send(text) {
  text = text.trim();
  if (!text || !student) return;
  stopVoice();
  $("#chatInput").value = "";
  const userEl = addMsg("user", text);
  const typing = addMsg("assistant", "…");
  typing.classList.add("typing");
  $("#sendBtn").disabled = true;
  try {
    const { reply, corrections } = await api("/api/chat", { studentId: student.id, text });
    typing.remove();
    addFixes(userEl, corrections);
    addMsg("assistant", reply);
    speak(reply);
  } catch (e) {
    typing.remove();
    userEl.classList.add("failed");
    const errEl = addMsg("assistant", "⚠ " + e.message);
    // One click re-sends the same message, so nothing has to be retyped.
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "chipbtn retry";
    retry.textContent = "↻ Try again";
    retry.onclick = () => { userEl.remove(); errEl.remove(); send(text); };
    errEl.append(retry);
  } finally {
    $("#sendBtn").disabled = false;
  }
}
$("#sendBtn").onclick = () => send($("#chatInput").value);
$("#chatInput").addEventListener("keydown", (e) => e.key === "Enter" && send(e.target.value));

// On phones the mic button is just an icon, so the message box and Send button fit on one line.
const micText = (listening) => matchMedia("(max-width:760px)").matches ? (listening ? "⏹" : "🎤") : (listening ? "⏹ Listening…" : "🎤 Speak");
$("#micBtn").textContent = micText(false);
$("#micBtn").setAttribute("aria-label", "Speak");
if (matchMedia("(max-width:760px)").matches) { // shorter hints so they are not cut off in the narrow boxes
  $("#chatInput").placeholder = "Type a message…";
  $("#gcInput").placeholder = "Message…";
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  $("#micBtn").disabled = true;
  $("#speechNote").textContent = "Speech recognition isn't supported in this browser. Use Chrome or Edge, or type instead.";
} else {
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  let listening = false;
  rec.onresult = (e) => {
    const t = [...e.results].map((r) => r[0].transcript).join("");
    $("#chatInput").value = t;
    if (e.results[e.results.length - 1].isFinal) send(t);
  };
  rec.onend = rec.onerror = () => { listening = false; $("#micBtn").classList.remove("on"); $("#micBtn").textContent = micText(false); };
  $("#micBtn").onclick = () => {
    if (listening) return rec.stop();
    stopVoice();
    listening = true;
    $("#micBtn").classList.add("on");
    $("#micBtn").textContent = micText(true);
    rec.start();
  };
}
// Wire grammar example chipbtns
document.querySelectorAll("#gExamples .chipbtn").forEach((b) => {
  b.onclick = () => { $("#gText").value = b.dataset.ex; $("#gBtn").focus(); };
});

// ---- Grammar check ----
function tag(label, val) {
  return val && val !== "none" ? `<span>${esc(label)}: <b>${esc(val)}</b></span>` : "";
}
$("#gBtn").onclick = async () => {
  const out = $("#gOut");
  $("#gBtn").disabled = true;
  out.textContent = "Analysing…";
  try {
    const r = await api("/api/grammar", { text: $("#gText").value, studentId: student?.id });
    out.innerHTML =
      `<div class="card"><b>Corrected text</b><p>${esc(r.correctedText)}</p></div>` +
      (r.sentences || []).map((s) => `
        <div class="card">
          <div class="g-sentence">${esc(s.text)}</div>
          <div class="tags">
            ${tag("Tense", s.tense)}
            ${tag("Aspect", s.aspect)}
            ${tag("Voice", s.voice)}
            ${tag("Mood", s.mood)}
            ${tag("Speech", s.speech)}
            ${s.conditional && s.conditional !== "none" ? tag("Conditional", s.conditional + " conditional") : ""}
            ${(s.clauses || []).map((c) => `<span>Clause: <b>${esc(c)}</b></span>`).join("")}
          </div>
          ${(s.modals || []).length ? `
            <div class="g-section"><span class="g-label">Modals</span>
              <div class="tags">${s.modals.map((m) => `<span><b>${esc(m.word)}</b> — ${esc(m.meaning)}</span>`).join("")}</div>
            </div>` : ""}
          ${(s.nonFinites || []).length ? `
            <div class="g-section"><span class="g-label">Non-finites</span>
              <div class="tags">${s.nonFinites.map((n) => `<span><b>${esc(n.word)}</b> (${esc(n.form)}) — ${esc(n.function)}</span>`).join("")}</div>
            </div>` : ""}
          ${(s.connectors || []).length ? `
            <div class="g-section"><span class="g-label">Connectors</span>
              <div class="tags">${s.connectors.map((c) => `<span><b>${esc(c.word)}</b> — ${esc(c.type)}</span>`).join("")}</div>
            </div>` : ""}
          ${(s.articles || []).filter((a) => !a.correct).length ? `
            <div class="g-section"><span class="g-label">Articles</span>
              <div class="tags">${s.articles.filter((a) => !a.correct).map((a) => `<span class="g-art-err">"${esc(a.used)}" before <b>${esc(a.noun)}</b> — ${esc(a.note)}</span>`).join("")}</div>
            </div>` : ""}
          ${(s.errors || []).length
            ? `<div class="g-section"><span class="g-label">Errors</span>` +
              s.errors.map((e) => `<p class="err g-err"><span class="g-cat">${esc(e.category)}</span> ${esc(e.issue)} → <b>${esc(e.fix)}</b><br><span class="small">${esc(e.explanation)}</span></p>`).join("") +
              `</div>`
            : '<p class="ok">✓ No errors</p>'}
        </div>`).join("");
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  } finally {
    $("#gBtn").disabled = false;
  }
};

// ---- Test ----
let testMode = "grammar";

document.getElementById("testModeSwitch").onclick = (e) => {
  const b = e.target.closest("[data-tmode]");
  if (!b) return;
  testMode = b.dataset.tmode;
  document.querySelectorAll("#testModeSwitch [data-tmode]").forEach((x) => x.classList.toggle("on", x.dataset.tmode === testMode));
  document.getElementById("grammarSetup").hidden = testMode !== "grammar";
  document.getElementById("trSetup").hidden = testMode !== "translation";
  document.getElementById("testRun").hidden = document.getElementById("testResult").hidden = true;
  document.getElementById("trTestRun").hidden = document.getElementById("trTestResult").hidden = true;
  if (testMode === "translation" && student) loadTrHistory();
};

async function loadTestSetup() {
  $("#testSetup").hidden = false;
  $("#testRun").hidden = $("#testResult").hidden = true;
  $("#trTestRun").hidden = $("#trTestResult").hidden = true;
  const topics = await api("/api/topics");
  $("#topicBoxes").innerHTML = topics.map((t) => `<label><input type="checkbox" value="${t.id}" checked> ${LABELS[t.id] || t.id}</label>`).join("");
  const rec = await api(`/api/students/${student.id}/difficulty`);
  const recName = rec.recommended[0].toUpperCase() + rec.recommended.slice(1);
  $("#tDiff").options[0].textContent = `Auto: ${recName} (recommended)`;
  $("#diffHint").innerHTML = `Recommended for you: ${levelPill(rec.recommended)} based on your level (<b>${esc(rec.level)}</b>)${rec.age != null ? ` and age <b>${rec.age}</b>` : ""}. Auto mixes in some easier and harder questions.`;
  const hist = await api(`/api/results?studentId=${student.id}`);
  $("#history").innerHTML = hist.length
    ? hist.map((h) => `<div class="small">${h.score}/${h.total} ${h.difficulty ? levelPill(h.difficulty) : ""} — ${new Date(h.date).toLocaleString()}</div>`).join("")
    : '<div class="small">No attempts yet.</div>';
  if (testMode === "translation") loadTrHistory();
}

async function loadTrHistory() {
  try {
    const hist = await api(`/api/tr-results?studentId=${student.id}`);
    document.getElementById("trHistory").innerHTML = hist.length
      ? hist.map((h) => `<div class="small">${h.score}/${h.maxScore} pts (${Math.round((h.score / h.maxScore) * 100)}%) — ${new Date(h.date).toLocaleString()}</div>`).join("")
      : '<div class="small">No attempts yet.</div>';
  } catch { document.getElementById("trHistory").innerHTML = '<div class="small">No attempts yet.</div>'; }
}

// Hindi Writing Test difficulty selector
let trDiff = "all";
document.getElementById("trDiffSwitch").onclick = (e) => {
  const b = e.target.closest("[data-trdiff]");
  if (!b) return;
  trDiff = b.dataset.trdiff;
  document.querySelectorAll("#trDiffSwitch [data-trdiff]").forEach((x) => x.classList.toggle("on", x.dataset.trdiff === trDiff));
};

let trCurrent = null;

document.getElementById("trStart").onclick = async () => {
  if (!student) return showWelcome();
  document.getElementById("trStart").disabled = true;
  try {
    const n = document.getElementById("trCount").value;
    const diff = trDiff === "all" ? "" : trDiff;
    const data = await api(`/api/translate-test?studentId=${student.id}&n=${n}${diff ? "&difficulty=" + diff : ""}`, null, "GET");
    trCurrent = data;
    trCurrent.answers = {};
    document.getElementById("testSetup").hidden = true;
    document.getElementById("trTestResult").hidden = true;
    renderTrTest();
  } catch (e) { alert(e.message); }
  finally { document.getElementById("trStart").disabled = false; }
};

function renderTrTest() {
  const run = document.getElementById("trTestRun");
  run.hidden = false;
  const total = trCurrent.questions.length;
  run.innerHTML =
    `<div class="testbar"><div class="testbar-top"><span class="small">${total} sentence${total > 1 ? "s" : ""} to translate</span></div><div class="bar"><div id="trProg" style="width:0"></div></div></div>` +
    trCurrent.questions.map((q) => `
      <div class="card" style="margin:12px 0">
        <div class="qmeta"><span class="qnum">${q.id + 1}</span><span class="small">${esc(q.tense)}</span>${levelPill(q.difficulty)}</div>
        <p style="font-size:1.15rem;font-weight:600;margin:8px 0 10px;direction:ltr">${esc(q.hindi)}</p>
        <input class="tr-ans" data-qid="${q.id}" placeholder="Write the English translation…" style="width:100%" autocomplete="off" spellcheck="true">
      </div>`).join("") +
    '<button id="trSubmit" style="margin-top:6px">Submit answers</button>';

  run.querySelectorAll(".tr-ans").forEach((inp) => inp.addEventListener("input", () => {
    const answered = [...run.querySelectorAll(".tr-ans")].filter((i) => i.value.trim()).length;
    document.getElementById("trProg").style.width = `${(answered / total) * 100}%`;
  }));
  document.getElementById("trSubmit").onclick = submitTrTest;
}

async function submitTrTest() {
  const inputs = document.querySelectorAll(".tr-ans");
  const answers = {};
  inputs.forEach((inp) => { answers[inp.dataset.qid] = inp.value.trim(); });
  const unanswered = [...inputs].filter((i) => !i.value.trim()).length;
  if (unanswered && !confirm(`${unanswered} question(s) left blank. Submit anyway?`)) return;

  document.getElementById("trSubmit").disabled = true;
  document.getElementById("trSubmit").textContent = "Evaluating…";
  try {
    const r = await api("/api/translate-test/submit", { testId: trCurrent.testId, studentId: student.id, answers });
    document.getElementById("trTestRun").hidden = true;
    const res = document.getElementById("trTestResult");
    res.hidden = false;
    const pct = r.percentage;
    res.innerHTML = `
      <div class="scorehead">
        <div class="ring" style="--pct:${pct}"><span>${pct}%</span></div>
        <div><h2>${r.score} / ${r.maxScore} pts</h2><p class="small">${pct >= 80 ? "Excellent! 🎉" : pct >= 50 ? "Good effort. Review the feedback below." : "Keep practising. Read each explanation."}</p></div>
      </div>
      <h3>Review</h3>
      ${r.review.map((x) => `
        <div class="card" style="margin:10px 0">
          <div class="qmeta"><span class="qnum">${x.id + 1}</span><span class="small">${esc(x.tense)}</span>${levelPill(x.difficulty)}</div>
          <p style="font-size:1.1rem;font-weight:600;margin:4px 0 8px">${esc(x.hindi)}</p>
          <div class="g-section"><span class="g-label">Your answer</span>
            <p class="${x.score === 2 ? "ok" : x.score === 1 ? "" : "err"}" style="margin:2px 0">${x.score === 2 ? "✓" : x.score === 1 ? "◑" : "✗"} ${esc(x.given || "(blank)")}</p>
          </div>
          <div class="g-section"><span class="g-label">Expected</span><p style="margin:2px 0">${esc(x.expected)}</p></div>
          <div class="g-section"><span class="g-label">Score</span> <span class="pill">${"★".repeat(x.score)}${"☆".repeat(2 - x.score)} ${x.score}/2</span></div>
          ${x.feedback ? `<div class="g-section"><span class="g-label">Feedback</span><p class="small" style="margin:2px 0">${esc(x.feedback)}</p></div>` : ""}
        </div>`).join("")}
      <button id="trAgain">Try another test</button>`;
    document.getElementById("trAgain").onclick = () => {
      res.hidden = true;
      document.getElementById("testSetup").hidden = false;
      loadTrHistory();
    };
  } catch (e) { alert(e.message); document.getElementById("trSubmit").disabled = false; document.getElementById("trSubmit").textContent = "Submit answers"; }
}

// ---- Progress ----
async function loadProgress() {
  const out = $("#progressOut");
  out.innerHTML = '<p class="small">Loading…</p>';
  try {
    const [p, gChecks] = await Promise.all([
      api(`/api/students/${student.id}/progress`),
      api(`/api/students/${student.id}/grammar-history`).catch(() => []),
    ]);
    const bar = (label, a, b) => `<div class="statrow"><span>${esc(label)}</span><span class="small">${a}/${b}</span></div><div class="bar"><div style="width:${b ? (a / b) * 100 : 0}%"></div></div>`;
    const cats = Object.entries(p.byCategory).sort((a, b) => b[1] - a[1]);

    // Aggregate error types across all grammar checks
    const errTypeCounts = {};
    for (const g of gChecks) for (const t of (g.errorTypes || [])) errTypeCounts[t] = (errTypeCounts[t] || 0) + 1;
    const topErrTypes = Object.entries(errTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    out.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${p.messages}</b><span>Messages sent</span></div>
        <div class="stat"><b>${p.corrections}</b><span>Corrections</span></div>
        <div class="stat"><b>${p.testsTaken}</b><span>Tests taken</span></div>
        <div class="stat"><b>${p.avgScore ?? "—"}${p.avgScore != null ? "%" : ""}</b><span>Avg. score</span></div>
      </div>
      <div class="card"><h3>Test accuracy by topic</h3>
        ${Object.entries(p.byTopic).map(([t, v]) => bar(LABELS[t] || t, v.correct, v.total)).join("") || '<p class="small">Take a test to see your strengths.</p>'}
      </div>
      <div class="card"><h3>Accuracy by difficulty</h3>
        ${["easy", "medium", "hard"].filter((d) => p.byDifficulty?.[d]).map((d) => bar(d[0].toUpperCase() + d.slice(1), p.byDifficulty[d].correct, p.byDifficulty[d].total)).join("") || '<p class="small">Take a test to see how you do at each level.</p>'}
      </div>
      <div class="card"><h3>Most common speaking mistakes</h3>
        ${cats.length ? cats.slice(0, 6).map(([c, n]) => `<div class="statrow"><span>${esc(c)}</span><span class="small">${n}×</span></div>`).join("") : '<p class="small">No corrections yet. Chat in the Speak tab.</p>'}
      </div>
      <div class="card"><h3>Recent tests</h3>
        ${p.recentTests.map((t) => `<div class="statrow"><span>${new Date(t.date).toLocaleString()}</span><b>${t.score}/${t.total}</b></div>`).join("") || '<p class="small">No tests yet.</p>'}
      </div>
      <div class="card"><h3>Grammar check history</h3>
        ${topErrTypes.length ? `<p class="small" style="margin-bottom:8px">Your most frequent error types:</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            ${topErrTypes.map(([t, n]) => `<span class="dict-syn">${esc(t)} <b>${n}×</b></span>`).join("")}
          </div>` : ""}
        ${gChecks.length ? `<div class="tablewrap"><table>
          <tr><th>Date</th><th>Text checked</th><th>Errors</th><th>Error types</th></tr>
          ${gChecks.map((g) => `<tr>
            <td>${new Date(g.at).toLocaleDateString()}</td>
            <td class="small">${esc(g.text.slice(0, 70))}${g.text.length > 70 ? "…" : ""}</td>
            <td>${g.errorCount}</td>
            <td>${(g.errorTypes || []).map((t) => `<span class="dict-syn" style="font-size:.72rem">${esc(t)}</span>`).join(" ")}</td>
          </tr>`).join("")}
        </table></div>` : '<p class="small">No grammar checks yet. Use the Grammar tab to check your text.</p>'}
      </div>`;
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

let current;
$("#tStart").onclick = async () => {
  const topics = [...document.querySelectorAll("#topicBoxes input:checked")].map((i) => i.value);
  if (!topics.length) return alert("Pick at least one topic.");
  current = await api(`/api/test?topics=${topics}&n=${$("#tCount").value}&difficulty=${$("#tDiff").value}&studentId=${student.id}`);
  current.answers = {};
  $("#testSetup").hidden = true;
  $("#testResult").hidden = true;
  renderTest();
};

// Badge showing the sentence type of a Hindi translation question (Modal, Tense, Passive, ...)
function stypeRow(q) {
  if (!q.stype) return "";
  const cls = "cat-" + q.stype.toLowerCase().replace(/[^a-z]+/g, "-");
  return `<div class="stype-row"><span class="g-label" style="margin:0">Sentence type</span><span class="badge ${cls}">${esc(q.stype)}</span>${q.sdetail ? `<span class="pill">${esc(q.sdetail)}</span>` : ""}</div>`;
}
function renderTest() {
  const run = $("#testRun");
  run.hidden = false;
  const total = current.questions.length;
  run.innerHTML =
    `<div class="testbar"><div class="testbar-top"><span id="tProgText" class="small">0 / ${total} answered</span><span class="small">${current.mode === "auto" ? "Auto" : "Difficulty"}: ${levelPill(current.difficulty)}</span></div><div class="bar"><div id="tProg" style="width:0"></div></div></div>` +
    current.questions.map((q) => `
      <div class="card qcard" data-id="${q.id}">
        <div class="qmeta"><span class="qnum">${q.id + 1}</span><span class="small">${LABELS[q.topic] || q.topic}</span>${levelPill(q.difficulty)}</div>
        <b>${esc(q.q)}</b>
        ${q.hindi ? `<p class="hindi-q">${esc(q.hindi)}</p>${stypeRow(q)}` : ""}
        ${q.options.map((o) => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join("")}
      </div>`).join("") + '<button id="tSubmit">Submit</button>';
  run.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
    const card = b.closest(".card");
    card.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
    card.classList.add("done");
    current.answers[card.dataset.id] = b.dataset.v;
    const n = Object.keys(current.answers).length;
    $("#tProg").style.width = `${(n / total) * 100}%`;
    $("#tProgText").textContent = `${n} / ${total} answered`;
  }));
  $("#tSubmit").onclick = submitTest;
}

// ---- Dictionary ----
// Dictionary empty state
$("#dictOut").innerHTML = `<div class="empty-state"><div class="es-icon">📖</div><p>Type a word above and press <b>Look up</b></p><p class="small">Definitions, pronunciation, examples &amp; synonyms</p></div>`;

// Primary source: dictionaryapi.dev. If it is unreachable or erroring, fall back to Datamuse.
const POS_NAMES = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };
async function fetchWithTimeout(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(timer); }
}
async function fromDictionaryApi(word) {
  const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error("Dictionary service error");
  const entries = await res.json();
  return {
    entries: entries.map((e) => {
      const audio = e.phonetics?.find((p) => p.audio)?.audio || "";
      return {
        word: e.word,
        phonetic: e.phonetics?.find((p) => p.text)?.text || e.phonetic || "",
        audio: audio.startsWith("//") ? "https:" + audio : audio,
        meanings: e.meanings || [],
      };
    }),
  };
}
async function fromDatamuse(word) {
  const q = encodeURIComponent(word);
  const [defRes, synRes] = await Promise.all([
    fetchWithTimeout(`https://api.datamuse.com/words?sp=${q}&md=d&max=1`),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${q}&max=8`).catch(() => null),
  ]);
  if (!defRes.ok) throw new Error("Dictionary service error");
  const [hit] = await defRes.json();
  if (!hit || !hit.defs) return { notFound: true, suggestion: hit?.word };
  if (hit.word.toLowerCase() !== word.toLowerCase()) return { notFound: true, suggestion: hit.word };
  const synonyms = synRes?.ok ? (await synRes.json()).map((s) => s.word) : [];
  const byPos = {};
  for (const d of hit.defs) {
    const [pos, text] = d.split("	");
    (byPos[POS_NAMES[pos] || "other"] ??= []).push({ definition: text });
  }
  return {
    entries: [{
      word: hit.word, phonetic: "", audio: "", speak: true,
      meanings: Object.entries(byPos).map(([partOfSpeech, definitions], i) => ({ partOfSpeech, definitions, synonyms: i === 0 ? synonyms : [] })),
    }],
  };
}
async function lookupWord() {
  const word = $("#dictInput").value.trim();
  if (!word) return;
  const out = $("#dictOut");
  $("#dictBtn").disabled = true;
  out.innerHTML = '<p class="small">Looking up…</p>';
  try {
    let result;
    try { result = await fromDictionaryApi(word); }
    catch { result = await fromDatamuse(word); } // network failure, timeout or server error
    if (!result.notFound && student) {
      api("/api/log/search", { studentId: student.id, word: word.toLowerCase() }).catch(() => {});
    }
    if (result.notFound) {
      out.innerHTML = `<p class="err">No results found for <b>${esc(word)}</b>.</p>` +
        (result.suggestion ? `<p class="small">Did you mean <span class="dict-syn" data-w="${esc(result.suggestion)}">${esc(result.suggestion)}</span>?</p>` : "");
      return;
    }
    out.innerHTML = result.entries.map((entry) => `
        <div class="card">
          <div class="dict-head">
            <span class="dict-word">${esc(entry.word)}</span>
            ${entry.phonetic ? `<span class="small">${esc(entry.phonetic)}</span>` : ""}
            ${entry.audio ? `<button class="dict-audio" data-audio="${esc(entry.audio)}" title="Play pronunciation">🔊</button>` : ""}
            ${entry.speak ? `<button class="dict-audio" data-speak="${esc(entry.word)}" title="Hear pronunciation">🔊</button>` : ""}
          </div>
          ${entry.meanings.map((m) => `
            <div class="dict-pos">${esc(m.partOfSpeech)}</div>
            <ol class="dict-defs">
              ${(m.definitions || []).slice(0, 4).map((d) => `
                <li>
                  ${esc(d.definition)}
                  ${d.example ? `<div class="dict-example">"${esc(d.example)}"</div>` : ""}
                </li>`).join("")}
            </ol>
            ${m.synonyms?.length ? `<div class="small">Synonyms: ${m.synonyms.slice(0, 6).map((s) => `<span class="dict-syn" data-w="${esc(s)}">${esc(s)}</span>`).join(" ")}</div>` : ""}`).join("")}
        </div>`).join("");
  } catch (e) {
    out.innerHTML = `<p class="err">Couldn't reach the dictionary. Check your internet connection and try again.</p>`;
  } finally {
    $("#dictBtn").disabled = false;
  }
}
$("#dictOut").addEventListener("click", (e) => {
  const t = e.target.closest("[data-w], [data-audio], [data-speak]");
  if (!t) return;
  if (t.dataset.w) dictLookup(t.dataset.w);
  else if (t.dataset.audio) new Audio(t.dataset.audio).play().catch(() => {});
  else say(t.dataset.speak, { force: true });
});
function dictLookup(word) { $("#dictInput").value = word; lookupWord(); }
$("#dictBtn").onclick = lookupWord;
$("#dictInput").addEventListener("keydown", (e) => e.key === "Enter" && lookupWord());

async function submitTest() {
  const unanswered = current.questions.length - Object.keys(current.answers).length;
  if (unanswered && !confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) return;
  const r = await api("/api/test/submit", { testId: current.testId, answers: current.answers, studentId: student.id });
  $("#testRun").hidden = true;
  const res = $("#testResult");
  res.hidden = false;
  const pct = r.score / r.total;
  const order = ["easy", "medium", "hard"];
  const di = order.indexOf(r.difficulty);
  const advice = r.total < 5 ? "" : pct >= 0.85 && di < 2 ? `You're ready for more challenge. Try <b>${order[di + 1]}</b> questions next.`
    : pct < 0.4 && di > 0 ? `Build your confidence with <b>${order[di - 1]}</b> questions, then come back.` : "";
  res.innerHTML = `
    <div class="scorehead">
      <div class="ring" style="--pct:${Math.round(pct * 100)}"><span>${Math.round(pct * 100)}%</span></div>
      <div><h2>${r.score} / ${r.total} correct ${levelPill(r.difficulty)}</h2><p class="small">${pct >= 0.8 ? "Excellent work! 🎉" : pct >= 0.5 ? "Good effort. Review the mistakes below." : "Keep practising. Read each explanation below."}</p>${advice ? `<p class="advice">💡 ${advice}</p>` : ""}</div>
    </div>
    <div class="card">${Object.entries(r.byTopic).map(([t, v]) => `
      <div class="statrow"><span>${LABELS[t] || t}</span><span class="small">${v.correct}/${v.total}</span></div><div class="bar"><div style="width:${(v.correct / v.total) * 100}%"></div></div>`).join("")}</div>
    <h3>Review</h3>
    ${r.review.map((x) => `
      <div class="card">
        <div class="qmeta">${levelPill(x.difficulty)}</div>
        <b>${esc(x.q)}</b>
        ${x.hindi ? `<p class="hindi-q">${esc(x.hindi)}</p>${stypeRow(x)}` : ""}
        <p class="${x.correct ? "ok" : "err"}">${x.correct ? "✓" : "✗"} Your answer: ${esc(x.given ?? "—")}${x.correct ? "" : ` · Correct: <b>${esc(x.answer)}</b>`}</p>
        <p class="small">${esc(x.explain)}</p>
      </div>`).join("")}
    <button id="tAgain">Take another test</button>`;
  $("#tAgain").onclick = loadTestSetup;
}

$("#gExamples").onclick = (e) => { if (e.target.dataset.ex) { $("#gText").value = e.target.dataset.ex; $("#gText").focus(); } };

// ---- Discussion & presentation topics ----
let disc = null, discMode = "gd", discCat = "All";
const levelPill = (l) => `<span class="pill lvl-${esc(l)}">${esc(l ? l[0].toUpperCase() + l.slice(1) : "")}</span>`;
const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

async function loadDiscuss() {
  const out = $("#discOut");
  if (!disc) {
    out.innerHTML = '<p class="small">Loading…</p>';
    try { disc = await api("/api/discussion"); } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  }
  renderDiscuss();
}
function discItems() {
  const all = discMode === "gd" ? disc.gd : disc.presentation;
  return all.map((t, i) => ({ ...t, idx: i })).filter((t) => discCat === "All" || t.category === discCat);
}
function renderDiscuss() {
  document.querySelectorAll("#discMode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === discMode));
  const isPresentation = discMode === "presentation";
  $("#discGenRow").hidden = !isPresentation;
  if (!isPresentation) $("#discGenOut").innerHTML = "";
  const all = discMode === "gd" ? disc.gd : disc.presentation;
  const cats = ["All", ...new Set(all.map((t) => t.category))];
  if (!cats.includes(discCat)) discCat = "All";
  $("#discCats").innerHTML = cats.map((c) => `<button class="chipbtn ${c === discCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("") + '<button class="chipbtn random" data-random="1">🎲 Random topic</button>';
  const phrases = disc.phrases[discMode === "gd" ? "gd" : "presentation"];
  const phraseBox = `<details class="card phrases"><summary><b>💡 Useful phrases</b></summary>${Object.entries(phrases).map(([k, v]) => `<div class="g-section"><span class="g-label">${esc(k)}</span>${list(v)}</div>`).join("")}</details>`;
  const cards = discItems().map((t) => discMode === "gd" ? `
    <details class="card topic" id="topic-${t.idx}">
      <summary><span class="ttitle">${esc(t.topic)}</span><span class="meta"><span class="pill">${esc(t.category)}</span>${levelPill(t.level)}</span></summary>
      <div class="cols">
        <div><span class="g-label ok">For</span>${list(t.for)}</div>
        <div><span class="g-label err">Against</span>${list(t.against)}</div>
      </div>
      <span class="g-label">Questions to ask the group</span>${list(t.questions)}
      <button data-practise="${t.idx}">🎤 Practise with coach</button>
    </details>` : `
    <details class="card topic" id="topic-${t.idx}">
      <summary><span class="ttitle">${esc(t.title)}</span><span class="meta"><span class="pill">${esc(t.category)}</span><span class="pill">⏱ ${t.minutes} min</span>${levelPill(t.level)}</span></summary>
      <span class="g-label">Ideas to cover</span>${list(t.ideas)}
      <span class="g-label">Sample opening</span><p class="opener">“${esc(t.opener)}”</p>
      <button data-practise="${t.idx}">🎤 Practise with coach</button>
    </details>`).join("");
  $("#discOut").innerHTML = phraseBox + (cards || '<p class="small">No topics in this category.</p>');
}
$("#discMode").onclick = (e) => { if (e.target.dataset.mode && disc) { discMode = e.target.dataset.mode; discCat = "All"; renderDiscuss(); } };
$("#discCats").onclick = (e) => {
  if (!disc) return;
  if (e.target.dataset.cat) { discCat = e.target.dataset.cat; renderDiscuss(); }
  if (e.target.dataset.random) {
    const items = discItems();
    const t = items[Math.floor(Math.random() * items.length)];
    const el = document.getElementById(`topic-${t.idx}`);
    document.querySelectorAll("#discOut details.topic").forEach((d) => (d.open = false));
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};
$("#discOut").onclick = (e) => {
  const b = e.target.closest("[data-practise]");
  if (!b) return;
  const t = (discMode === "gd" ? disc.gd : disc.presentation)[b.dataset.practise];
  if (!student) return;
  const msg = discMode === "gd"
    ? `Let's practise a group discussion on: "${t.topic}". Please act as another participant: give your opinion, then ask me a question. Correct my grammar as we go.`
    : `I want to practise a ${t.minutes}-minute presentation on "${t.title}". Please ask me to give my opening, then give feedback on my grammar and structure.`;
  openTab("speak");
  send(msg);
};
document.querySelector('nav button[data-tab="discuss"]').addEventListener("click", loadDiscuss);

async function generatePresentation() {
  const topic = $("#discTopicInput").value.trim();
  if (!topic) { $("#discTopicInput").focus(); return; }
  if (!student) { toast("Please sign in first."); return; }
  const out = $("#discGenOut");
  out.innerHTML = '<p class="small">Generating…</p>';
  $("#discGenBtn").disabled = true;
  try {
    const p = await api("/api/presentation/generate", { topic, studentId: student.id });
    const vocabHtml = Array.isArray(p.keyVocab) ? p.keyVocab.map((w) => `<span class="pill">${esc(w)}</span>`).join(" ") : "";
    const struct = p.structure || {};
    const practiseMsg = `I want to practise a ${p.minutes || 3}-minute presentation on "${esc(p.title || topic)}". Please ask me to give my opening, then give feedback on my grammar and structure.`;
    out.innerHTML = `<details class="card topic" open>
      <summary>
        <span class="ttitle">${esc(p.title || topic)}</span>
        <span class="meta"><span class="pill">Custom</span><span class="pill">⏱ ${esc(String(p.minutes || 3))} min</span></span>
      </summary>
      <div class="g-section"><span class="g-label">Opening line</span><p class="opener">"${esc(p.opener || "")}"</p></div>
      <div class="g-section"><span class="g-label">Ideas to cover</span>${list(Array.isArray(p.ideas) ? p.ideas : [])}</div>
      <div class="g-section"><span class="g-label">Structure</span>
        <ul>
          <li><b>Intro:</b> ${esc(struct.intro || "")}</li>
          <li><b>Body:</b> ${esc(struct.body || "")}</li>
          <li><b>Conclusion:</b> ${esc(struct.conclusion || "")}</li>
        </ul>
      </div>
      ${vocabHtml ? `<div class="g-section"><span class="g-label">Key vocabulary</span><div style="margin-top:6px">${vocabHtml}</div></div>` : ""}
      <button data-genpractise="${esc(practiseMsg)}">🎤 Practise with coach</button>
    </details>`;
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  } finally {
    $("#discGenBtn").disabled = false;
  }
}
$("#discGenBtn").onclick = generatePresentation;
$("#discTopicInput").addEventListener("keydown", (e) => { if (e.key === "Enter") generatePresentation(); });
$("#discGenOut").addEventListener("click", (e) => {
  const b = e.target.closest("[data-genpractise]");
  if (!b || !student) return;
  openTab("speak");
  send(b.dataset.genpractise);
});

// ---- Group chat ----
const GC_ROOMS = [["general", "General"], ["grammar", "Grammar help"], ["speaking", "Speaking practice"], ["discussion", "Group discussion"]];
let gcRoom = "general", gcLast = 0, gcSince = 0, gcTimer = null, gcPolling = false;
const GC_EMOJI = ["👍", "❤️", "😂", "😮", "🎉", "👏"];

function renderGcRooms() {
  $("#gcRooms").innerHTML = GC_ROOMS.map(([id, label]) => `<button class="chipbtn ${id === gcRoom ? "on" : ""}" data-room="${id}"># ${esc(label)}</button>`).join("");
}
// Draws one message. If it is already on screen (it was edited, or someone reacted) it is redrawn in place.
function gcAdd(m) {
  const log = $("#gcLog");
  const old = log.querySelector(`[data-id="${m.id}"]`);
  if (old?.classList.contains("editing")) return; // don't wipe a message that is being edited
  const mine = !!student && m.studentId === student.id;
  const d = document.createElement("div");
  d.className = "gcmsg " + (mine ? "mine" : "other") + (m.admin ? " admin" : "");
  d.dataset.id = m.id;
  const reactions = (m.reactions || []).map((r) =>
    `<button type="button" class="gcreact ${r.mine ? "mine" : ""}" data-react="${esc(r.emoji)}" title="${esc(r.names.join(", "))}">${r.emoji} <b>${r.count}</b></button>`).join("");
  d.innerHTML = `${mine ? "" : `<span class="avatar">${m.admin ? "🛡️" : esc((m.name || "?")[0].toUpperCase())}</span>`}
    <div class="gcbody">
      <div class="gcname">${esc(m.name)}${mine ? ' <span class="youtag">· You</span>' : ""}${m.admin ? ' <span class="adminbadge">ADMIN</span>' : ""}</div>
      <div class="gctext">${esc(m.text)}</div>
      ${reactions ? `<div class="gcreactions">${reactions}</div>` : ""}
      <div class="time">${m.edited ? "edited · " : ""}${fmtTime(m.at)}</div>
      <div class="gcactions">
        <button type="button" data-act="react" title="React">😊</button>
        ${mine && !m.admin ? '<button type="button" data-act="edit" title="Edit your message">✏️</button>' : ""}
        ${mine || adminKey ? '<button type="button" data-act="delete" title="Delete message">🗑</button>' : ""}
      </div>
    </div>`;
  if (old) old.replaceWith(d); else log.append(d);
}
async function gcPoll() {
  if (!student || gcPolling) return;
  gcPolling = true;
  const room = gcRoom;
  try {
    const r = await api(`/api/groupchat/${room}?after=${gcLast}&since=${gcSince}&studentId=${student.id}`);
    if (room !== gcRoom) return; // user switched rooms while waiting
    gcSince = Math.max(0, r.serverTime - 2000); // next poll also fetches messages edited or reacted to after this moment
    const log = $("#gcLog");
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    r.messages.forEach((m) => { gcAdd(m); gcLast = Math.max(gcLast, m.id); });
    // drop messages an admin deleted
    const keep = new Set(r.ids), min = Math.min(...r.ids);
    log.querySelectorAll("[data-id]").forEach((el) => { const id = +el.dataset.id; if (id >= min && !keep.has(id)) el.remove(); });
    $("#gcOnline").textContent = r.online ? `🟢 ${r.online} online` : "";
    renderGcMembers(r.members || [], r.online);
    gcApplyState(r.enabled, r.muted);
    const count = log.querySelectorAll("[data-id]").length;
    const placeholder = log.querySelector("p.small");
    if (!count && !placeholder) log.innerHTML = '<p class="small" style="text-align:center;margin:auto">No messages yet. Say hello! 👋</p>';
    else if (count) placeholder?.remove();
    if (nearBottom || r.messages.length === count) log.scrollTop = log.scrollHeight;
  } catch { /* shown on the next successful poll */ } finally { gcPolling = false; }
}
// Everyone's name, online people first (names only; no ages or levels are shared).
function renderGcMembers(members, online) {
  $("#gcMembersSum").textContent = `👥 Members · ${online} online of ${members.length}`;
  $("#gcMembersList").innerHTML = members.map((m) =>
    `<span class="gcchip ${m.online ? "on" : ""}" title="${m.online ? "Online now" : "Offline"}"><i></i>${esc(m.name)}</span>`).join("")
    || '<span class="small">No members yet.</span>';
}
// Admin can switch the chat off or mute a student: show why and block sending.
function gcApplyState(enabled, muted) {
  const blocked = !enabled || muted;
  const banner = $("#gcBanner");
  banner.hidden = !blocked;
  banner.textContent = !enabled ? "🔒 Group chat is switched off by the admin right now." : muted ? "🔇 You have been muted by the admin and cannot send messages." : "";
  $("#gcInput").disabled = blocked;
  $("#gcSend").disabled = blocked;
}
function gcStart() {
  if (!gcStart.seen) { // first visit on a small screen: start with the member list collapsed to leave room for messages
    gcStart.seen = true;
    if (matchMedia("(max-width:640px)").matches) $("#gcMembers").open = false;
  }
  renderGcRooms();
  gcSwitch(gcRoom);
  clearInterval(gcTimer);
  gcTimer = setInterval(() => {
    if (!$("#groupchat").classList.contains("active")) { clearInterval(gcTimer); return; } // left the tab
    if (!document.hidden) gcPoll();
  }, 3000);
}
function gcSwitch(room) {
  gcRoom = room; gcLast = 0; gcSince = 0;
  $("#gcLog").innerHTML = "";
  $("#gcErr").textContent = "";
  renderGcRooms();
  gcPoll();
}
async function gcSend() {
  const text = $("#gcInput").value.trim();
  if (!text || !student) return;
  $("#gcSend").disabled = true;
  $("#gcErr").textContent = "";
  try {
    const m = await api(`/api/groupchat/${gcRoom}`, { studentId: student.id, text });
    $("#gcInput").value = "";
    $("#gcLog").querySelector("p.small")?.remove();
    gcAdd(m);
    gcLast = Math.max(gcLast, m.id);
    $("#gcLog").scrollTop = $("#gcLog").scrollHeight;
  } catch (e) {
    $("#gcErr").textContent = e.message;
  } finally {
    $("#gcSend").disabled = false;
    $("#gcInput").focus();
  }
}
$("#gcRooms").onclick = (e) => { const b = e.target.closest("[data-room]"); if (b && b.dataset.room !== gcRoom) gcSwitch(b.dataset.room); };
$("#gcSend").onclick = gcSend;
$("#gcInput").addEventListener("keydown", (e) => e.key === "Enter" && gcSend());
// ---- Group chat: react, edit, delete ----
const closePickers = () => document.querySelectorAll("#gcLog .gcpicker").forEach((p) => p.remove());
function togglePicker(msgEl) {
  const had = msgEl.querySelector(".gcpicker");
  closePickers();
  if (had) return;
  const p = document.createElement("div");
  p.className = "gcpicker";
  p.innerHTML = GC_EMOJI.map((em) => `<button type="button" data-pick="${em}">${em}</button>`).join("");
  msgEl.querySelector(".gcbody").append(p);
}
async function gcReact(id, emoji) {
  closePickers();
  const m = await api(`/api/groupchat/${gcRoom}/${id}/react`, { studentId: student.id, emoji });
  gcAdd(m);
}
function gcEdit(msgEl) {
  if (msgEl.classList.contains("editing")) return;
  closePickers();
  const textEl = msgEl.querySelector(".gctext");
  msgEl.dataset.old = textEl.textContent;
  msgEl.classList.add("editing");
  textEl.innerHTML = '<textarea class="gcedit" maxlength="500" rows="2"></textarea><div class="gceditbtns"><button type="button" data-edit="save">Save</button><button type="button" data-edit="cancel">Cancel</button></div>';
  const ta = textEl.querySelector("textarea");
  ta.value = msgEl.dataset.old;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function gcEditCancel(msgEl) {
  msgEl.querySelector(".gctext").textContent = msgEl.dataset.old;
  msgEl.classList.remove("editing");
}
async function gcEditSave(msgEl) {
  const text = msgEl.querySelector(".gcedit").value.trim();
  if (!text) return $("#gcErr").textContent = "A message can't be empty. Delete it instead.";
  if (text === msgEl.dataset.old) return gcEditCancel(msgEl);
  const m = await api(`/api/groupchat/${gcRoom}/${msgEl.dataset.id}`, { studentId: student.id, text }, "PATCH");
  msgEl.classList.remove("editing");
  gcAdd(m);
}
async function gcDelete(msgEl) {
  if (!confirm(adminKey && !msgEl.classList.contains("mine") ? "Delete this message for everyone? (admin)" : "Delete your message for everyone?")) return;
  const res = await fetch(`/api/groupchat/${gcRoom}/${msgEl.dataset.id}?studentId=${student.id}`, { method: "DELETE", headers: adminKey ? { "x-admin-key": adminKey } : {} });
  if (res.ok) msgEl.remove();
  else $("#gcErr").textContent = (await res.json().catch(() => ({}))).error || "Could not delete the message.";
}
$("#gcLog").addEventListener("click", async (e) => {
  if (!e.target.closest(".gcpicker") && !e.target.closest('[data-act="react"]')) closePickers();
  // Touch screens have no hover, so tapping a message shows or hides its react / edit / delete buttons.
  const bubble = e.target.closest(".gcbody");
  if (bubble && matchMedia("(hover:none)").matches && !e.target.closest("button, textarea, .gcpicker")) {
    const msg = bubble.parentElement, wasOpen = msg.classList.contains("open");
    document.querySelectorAll("#gcLog .gcmsg.open").forEach((m) => m.classList.remove("open"));
    if (!wasOpen) msg.classList.add("open");
  }
  const msgEl = e.target.closest(".gcmsg");
  if (!msgEl || !student) return;
  const t = e.target.closest("[data-act],[data-pick],[data-react],[data-edit]");
  if (!t) return;
  $("#gcErr").textContent = "";
  try {
    if (t.dataset.act === "react") togglePicker(msgEl);
    else if (t.dataset.pick || t.dataset.react) await gcReact(msgEl.dataset.id, t.dataset.pick || t.dataset.react);
    else if (t.dataset.act === "edit") gcEdit(msgEl);
    else if (t.dataset.act === "delete") await gcDelete(msgEl);
    else if (t.dataset.edit === "save") await gcEditSave(msgEl);
    else if (t.dataset.edit === "cancel") gcEditCancel(msgEl);
  } catch (err) {
    $("#gcErr").textContent = err.message;
  }
});
// Enter saves an edit, Shift+Enter adds a line, Esc cancels.
$("#gcLog").addEventListener("keydown", async (e) => {
  if (!e.target.classList.contains("gcedit")) return;
  const msgEl = e.target.closest(".gcmsg");
  if (e.key === "Escape") { e.stopPropagation(); gcEditCancel(msgEl); }
  else if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    try { await gcEditSave(msgEl); } catch (err) { $("#gcErr").textContent = err.message; }
  }
});
document.querySelector('nav button[data-tab="groupchat"]').addEventListener("click", gcStart);

// ---- Time on site: heartbeat while the tab is visible ----
const PING_EVERY = 15;
setInterval(() => {
  if (!student || document.visibilityState !== "visible") return;
  fetch(`/api/students/${student.id}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds: PING_EVERY }) }).catch(() => {});
}, PING_EVERY * 1000);
const fmtDur = (s) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);

// ---- Admin ----
let adminKey = sessionStorage.getItem("adminKey") || "";
async function adminFetch() {
  const res = await fetch("/api/admin/summary", { headers: { "x-admin-key": adminKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}
async function loadAdmin() {
  const out = $("#adminOut");
  out.innerHTML = '<p class="small">Loading…</p>';
  try {
    const d = await adminFetch();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const maxAge = Math.max(1, ...Object.values(d.ageGroups));
    out.innerHTML = `
      <div class="admin-head">
        <div><h2 style="margin:0">Students</h2><p class="small" style="margin:2px 0 0">Last refreshed ${now}</p></div>
        <button class="ghost" onclick="loadAdmin()">↻ Refresh</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${d.totalUsers}</b><span>Total users</span></div>
        <div class="stat online-stat"><b>${d.onlineNow ?? 0}</b><span>🟢 Online now</span></div>
        <div class="stat"><b>${d.active24h}</b><span>Active (24h)</span></div>
        <div class="stat"><b>${d.active7d}</b><span>Active (7 days)</span></div>
        <div class="stat"><b>${d.avgAge ?? "—"}</b><span>Average age</span></div>
        <div class="stat"><b>${d.totalTests}</b><span>Grammar tests</span></div>
        <div class="stat"><b>${d.totalTrTests ?? 0}</b><span>Hindi writing tests</span></div>
        <div class="stat"><b>${d.totalGrammarChecks ?? 0}</b><span>Grammar checks</span></div>
        <div class="stat"><b>${d.totalSearches ?? 0}</b><span>Dictionary searches</span></div>
        <div class="stat"><b>${fmtDur(d.totalTime)}</b><span>Total time on site</span></div>
        <div class="stat"><b>${fmtDur(d.avgTime)}</b><span>Avg. time per user</span></div>
      </div>
      <div class="card"><h3>Age groups</h3>
        ${Object.entries(d.ageGroups).map(([g, n]) => `<div class="statrow"><span>${g}</span><span class="small">${n}</span></div><div class="bar"><div style="width:${(n / maxAge) * 100}%"></div></div>`).join("")}
      </div>
      <div class="card"><h3>Levels</h3>
        ${d.byLevel.map((l) => `<span class="dict-syn">${esc(l.level)}: ${l.count}</span>`).join("")}
      </div>
      ${d.topWords?.length ? `
      <div class="card"><h3>Top searched words</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${d.topWords.map((w) => `<span class="dict-syn">${esc(w.word)} <b>${w.count}</b></span>`).join("")}
        </div>
      </div>` : ""}
      ${d.recentSearches?.length ? `
      <div class="card"><h3>Recent dictionary searches</h3>
        <div class="tablewrap"><table>
          <tr><th>Student</th><th>Word</th><th>When</th></tr>
          ${d.recentSearches.map((s) => `<tr><td>${esc(s.name)}</td><td><b>${esc(s.word)}</b></td><td>${new Date(s.at).toLocaleString()}</td></tr>`).join("")}
        </table></div>
      </div>` : ""}
      <div class="card"><h3>Users</h3>
        <div class="tablewrap"><table>
          <tr><th></th><th>Name</th><th>Age</th><th>Level</th><th>Time</th><th>Msgs</th><th>MCQ Tests</th><th>MCQ Avg</th><th>Hindi Tests</th><th>Hindi Avg</th><th>Grammar</th><th>Searches</th><th>Visits</th><th>Last seen</th><th>Chat</th></tr>
          ${d.users.map((u) => `<tr><td title="${u.online ? "Online now" : "Offline"}"><span class="online-dot ${u.online ? "on" : ""}"></span></td><td><button class="link-btn" data-uid="${esc(u.id)}" data-uname="${esc(u.name)}">${esc(u.name)}</button></td><td>${u.age ?? "—"}</td><td>${esc(u.level)}</td><td>${fmtDur(u.timeSpent)}</td><td>${u.messages}</td><td>${u.tests}</td><td>${u.avgScore != null ? u.avgScore + "%" : "—"}</td><td>${u.trTests ?? 0}</td><td>${u.trAvgScore != null ? u.trAvgScore + "%" : "—"}</td><td>${u.grammarChecks ?? 0}</td><td>${u.searches ?? 0}</td><td>${u.visits}</td><td>${new Date(u.lastSeen).toLocaleString()}</td><td><button class="ghost mutebtn ${u.chatMuted ? "muted" : ""}" data-mute="${esc(u.id)}" data-muted="${u.chatMuted ? 1 : 0}">${u.chatMuted ? "🔇 Muted" : "Mute"}</button></td></tr>`).join("") || '<tr><td colspan="15" class="small">No users yet.</td></tr>'}
        </table></div>
      </div>
      <div class="card"><h3>👥 Group chat moderation</h3><div id="adminGc"><p class="small">Loading…</p></div></div>`;
    loadAdminChat();
  } catch (e) {
    if (e.status === 403) { adminKey = ""; sessionStorage.removeItem("adminKey"); $("#adminTab").hidden = true; }
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
// ---- Admin: group chat moderation ----
let adminGcRoom = "general";
async function adminReq(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
async function loadAdminChat() {
  const box = document.getElementById("adminGc");
  if (!box) return;
  try {
    const d = await adminReq("GET", `/api/admin/groupchat?room=${adminGcRoom}`);
    adminGcRoom = d.room;
    const label = d.rooms.find((r) => r.id === d.room)?.label || d.room;
    box.innerHTML = `
      <div class="gcadmin-bar">
        <label class="gcswitch"><input type="checkbox" id="gcEnabled" ${d.enabled ? "checked" : ""}> Group chat is <b>${d.enabled ? "ON" : "OFF"}</b> for students</label>
        <button class="ghost" data-agc="refresh">↻ Refresh</button>
      </div>
      <div class="starters">${d.rooms.map((r) => `<button class="chipbtn ${r.id === d.room ? "on" : ""}" data-aroom="${r.id}"># ${esc(r.label)} <b>${r.count}</b></button>`).join("")}</div>
      <div class="row">
        <input id="gcAnnounce" maxlength="500" placeholder="Post an announcement in # ${esc(label)} as Admin…">
        <button data-agc="announce">Post</button>
        <button class="ghost danger" data-agc="clear">Clear room</button>
      </div>
      <div class="tablewrap" style="margin-top:12px"><table>
        <tr><th>Time</th><th>Student</th><th>Message</th><th></th></tr>
        ${d.messages.slice().reverse().map((m) => `<tr>
          <td>${new Date(m.at).toLocaleString()}</td>
          <td>${m.admin ? "<b>Admin</b>" : esc(m.name)}</td>
          <td class="gcmsgcell">${esc(m.text)}</td>
          <td><button class="ghost" data-adel="${m.id}" title="Delete message">🗑</button>${m.admin ? "" : ` <button class="ghost" data-amute="${esc(m.studentId)}" title="Mute this student">🔇</button>`}</td>
        </tr>`).join("") || '<tr><td colspan="4" class="small">No messages in this room.</td></tr>'}
      </table></div>
      <h4 style="margin:16px 0 6px">Muted students (${d.muted.length})</h4>
      ${d.muted.length ? d.muted.map((s) => `<span class="dict-syn">${esc(s.name)} <button class="ghost" data-aunmute="${esc(s.id)}" style="padding:0 6px">Unmute</button></span>`).join(" ") : '<p class="small" style="margin:0">Nobody is muted.</p>'}`;
  } catch (e) {
    box.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
document.getElementById("adminOut").addEventListener("click", async (e) => {
  const t = e.target.closest("[data-aroom],[data-agc],[data-adel],[data-amute],[data-aunmute],[data-mute]");
  if (!t) return;
  try {
    if (t.dataset.aroom) { adminGcRoom = t.dataset.aroom; return loadAdminChat(); }
    if (t.dataset.agc === "refresh") return loadAdminChat();
    if (t.dataset.agc === "announce") {
      const input = document.getElementById("gcAnnounce");
      if (!input.value.trim()) return;
      await adminReq("POST", `/api/admin/groupchat/${adminGcRoom}/announce`, { text: input.value });
      return loadAdminChat();
    }
    if (t.dataset.agc === "clear") {
      if (!confirm(`Delete ALL messages in this room? This cannot be undone.`)) return;
      await adminReq("DELETE", `/api/admin/groupchat/${adminGcRoom}`);
      return loadAdminChat();
    }
    if (t.dataset.adel) {
      if (!confirm("Delete this message for everyone?")) return;
      await adminReq("DELETE", `/api/groupchat/${adminGcRoom}/${t.dataset.adel}`);
      return loadAdminChat();
    }
    if (t.dataset.amute || t.dataset.aunmute) {
      const id = t.dataset.amute || t.dataset.aunmute;
      await adminReq("POST", `/api/admin/students/${id}/mute`, { muted: !!t.dataset.amute });
      return loadAdminChat();
    }
    if (t.dataset.mute) { // users table toggle
      await adminReq("POST", `/api/admin/students/${t.dataset.mute}/mute`, { muted: t.dataset.muted !== "1" });
      return loadAdmin();
    }
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById("adminOut").addEventListener("change", async (e) => {
  if (e.target.id !== "gcEnabled") return;
  try { await adminReq("POST", "/api/admin/groupchat/enabled", { enabled: e.target.checked }); } catch (err) { alert(err.message); }
  loadAdminChat();
});

function showAdminLogin() {
  $("#adminPwInput").value = "";
  $("#adminErr").textContent = "";
  $("#adminLogin").hidden = false;
  $("#adminPwInput").focus();
}
$("#adminCancelBtn").onclick = () => { $("#adminLogin").hidden = true; };
$("#adminForm").onsubmit = async (e) => {
  e.preventDefault();
  adminKey = $("#adminPwInput").value;
  try {
    await adminFetch();
    sessionStorage.setItem("adminKey", adminKey);
    $("#adminLogin").hidden = true;
    $("#adminTab").hidden = false;
    openTab("admin");
  } catch (err) {
    adminKey = "";
    sessionStorage.removeItem("adminKey");
    $("#adminErr").textContent = err.message;
  }
};
$("#adminBtn").onclick = () => {
  if (adminKey) { openTab("admin"); } else { showAdminLogin(); }
};
document.querySelector('nav button[data-tab="admin"]').addEventListener("click", loadAdmin);
if (adminKey) $("#adminTab").hidden = false;

// Admin: per-user test/grammar drilldown
async function openUserDetail(uid, uname) {
  const modal = $("#userDetailModal");
  const out = $("#userDetailOut");
  $("#userDetailName").textContent = uname;
  out.innerHTML = '<p class="small">Loading…</p>';
  modal.hidden = false;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/tests`, { headers: { "x-admin-key": adminKey } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || res.statusText);
    let html = "";

    html += `<h3>Grammar MCQ Tests (${d.mcq.length})</h3>`;
    if (d.mcq.length) {
      html += `<div class="tablewrap"><table><tr><th>Date</th><th>Score</th><th>%</th><th>Difficulty</th><th>Topics</th></tr>` +
        d.mcq.slice().reverse().map((t) => {
          const pct = Math.round((t.score / t.total) * 100);
          const topics = Object.keys(t.byTopic || {}).join(", ") || "—";
          return `<tr><td>${new Date(t.date).toLocaleDateString()}</td><td>${t.score}/${t.total}</td><td>${pct}%</td><td>${esc(t.difficulty || "—")}</td><td class="small">${esc(topics)}</td></tr>`;
        }).join("") + `</table></div>`;
    } else { html += '<p class="small">No MCQ tests yet.</p>'; }

    html += `<h3 style="margin-top:20px">Hindi Writing Tests (${d.tr.length})</h3>`;
    if (d.tr.length) {
      html += `<div class="tablewrap"><table><tr><th>Date</th><th>Score</th><th>Max</th><th>%</th><th>Questions</th></tr>` +
        d.tr.slice().reverse().map((t) => {
          const pct = Math.round((t.score / t.maxScore) * 100);
          return `<tr><td>${new Date(t.date).toLocaleDateString()}</td><td>${t.score}</td><td>${t.maxScore}</td><td>${pct}%</td><td>${t.total}</td></tr>`;
        }).join("") + `</table></div>`;
    } else { html += '<p class="small">No Hindi writing tests yet.</p>'; }

    html += `<h3 style="margin-top:20px">Grammar Checks (${d.grammar.length})</h3>`;
    if (d.grammar.length) {
      html += `<div class="tablewrap"><table><tr><th>Date</th><th>Text checked</th><th>Errors</th><th>Error types</th></tr>` +
        d.grammar.slice().reverse().map((g) => `<tr>
          <td>${new Date(g.at).toLocaleDateString()}</td>
          <td class="small">${esc(g.text.slice(0, 80))}${g.text.length > 80 ? "…" : ""}</td>
          <td>${g.errorCount}</td>
          <td>${(g.errorTypes || []).map((t) => `<span class="dict-syn" style="font-size:.72rem">${esc(t)}</span>`).join(" ")}</td>
        </tr>`).join("") + `</table></div>`;
    } else { html += '<p class="small">No grammar checks yet.</p>'; }

    out.innerHTML = html;
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
$("#adminOut").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-uid]");
  if (btn) openUserDetail(btn.dataset.uid, btn.dataset.uname);
});
$("#closeUserDetail").addEventListener("click", () => { $("#userDetailModal").hidden = true; });
$("#userDetailModal").addEventListener("click", (e) => { if (e.target === $("#userDetailModal")) $("#userDetailModal").hidden = true; });

// ---- Hindi → English Translator ----
document.getElementById("trExamples").onclick = (e) => {
  const b = e.target.closest("[data-ex]");
  if (b) { document.getElementById("trInput").value = b.dataset.ex; document.getElementById("trBtn").focus(); }
};

document.getElementById("trBtn").onclick = async () => {
  const text = document.getElementById("trInput").value.trim();
  if (!text) return;
  const out = document.getElementById("trOut");
  document.getElementById("trBtn").disabled = true;
  out.innerHTML = '<p class="small">Translating…</p>';
  try {
    const r = await api("/api/translate", { text });
    let html = `<div class="card">
      <div class="g-section">
        <span class="g-label">English Translation</span>
        <p style="font-size:1.1rem;line-height:1.6;margin:6px 0">${esc(r.translation)}</p>
        <button class="ghost dict-audio" data-speak="${esc(r.translation)}" style="margin-top:4px;font-size:.85rem">🔊 Listen</button>
      </div>`;
    if (r.sentences?.length) {
      const multi = r.sentences.length > 1;
      html += `<div class="g-section"><span class="g-label">Sentence type</span>` + r.sentences.map((s) => {
        const a = s.analysis || {};
        const cat = a.category || "Simple sentence";
        const cls = "cat-" + cat.toLowerCase().replace(/[^a-z]+/g, "-");
        return `<div class="an">
          ${multi ? `<div class="an-en">${esc(s.english)}</div>` : ""}
          <div class="an-row"><span class="badge ${cls}">${esc(cat)}</span>
            ${a.tense ? `<span class="pill">Tense: ${esc(a.tense)}</span>` : ""}
            ${a.modal ? `<span class="pill">Modal: ${esc(a.modal)}</span>` : ""}
            ${a.voice ? `<span class="pill">Voice: ${esc(a.voice)}</span>` : ""}
            ${a.sentenceType ? `<span class="pill">${esc(a.sentenceType)}</span>` : ""}
          </div>
          ${a.structure ? `<p class="small an-line"><b>Structure:</b> ${esc(a.structure)}</p>` : ""}
          ${a.why ? `<p class="small an-line"><b>Why:</b> ${esc(a.why)}</p>` : ""}
          ${s.alternatives?.length ? `<p class="small an-line"><b>Other meanings:</b> ${s.alternatives.map((x) => esc(x)).join(" · ")}</p>` : ""}
        </div>`;
      }).join("") + `</div>`;
    }
    if (r.words?.length) {
      html += `<div class="g-section"><span class="g-label">Word by word</span>
        <table style="width:100%;margin-top:6px;font-size:.9rem"><tr style="color:var(--muted);font-size:.75rem"><th style="text-align:left;padding:4px 8px 4px 0">Hindi</th><th style="text-align:left;padding:4px 8px">Transliteration</th><th style="text-align:left;padding:4px 0">English</th></tr>`;
      for (const w of r.words) {
        html += `<tr><td style="padding:4px 8px 4px 0;font-weight:600">${esc(w.hindi)}</td><td style="padding:4px 8px;color:var(--muted);font-style:italic">${esc(w.transliteration)}</td><td style="padding:4px 0">${esc(w.english)}</td></tr>`;
      }
      html += `</table></div>`;
    }
    if (r.note) {
      html += `<div class="g-section"><span class="g-label">Grammar tip</span><p class="small" style="margin:4px 0;padding:8px 12px;background:var(--brand-soft);border-radius:8px">${esc(r.note)}</p></div>`;
    }
    html += `</div>`;
    out.innerHTML = html;
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  } finally {
    document.getElementById("trBtn").disabled = false;
  }
};

document.getElementById("trOut").addEventListener("click", (e) => {
  const b = e.target.closest("[data-speak]");
  if (b) say(b.dataset.speak, { force: true });
});

document.getElementById("trInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) document.getElementById("trBtn").click();
});

// ---- Interview Preparation ----
let ivType = "job", ivId = null;

document.getElementById("ivTypeSwitch").onclick = (e) => {
  const b = e.target.closest("[data-ivtype]");
  if (!b) return;
  ivType = b.dataset.ivtype;
  document.querySelectorAll("#ivTypeSwitch [data-ivtype]").forEach((x) => x.classList.toggle("on", x.dataset.ivtype === ivType));
  document.getElementById("ivRoleRow").hidden = ivType !== "job";
};

document.getElementById("ivStart").onclick = async () => {
  if (!student) return showWelcome();
  const btn = document.getElementById("ivStart");
  btn.disabled = true;
  try {
    const role = ivType === "job" ? document.getElementById("ivRole").value : "";
    const { interviewId, question } = await api("/api/interview/start", { studentId: student.id, type: ivType, role });
    ivId = interviewId;
    document.getElementById("ivSetup").hidden = true;
    document.getElementById("ivSummary").hidden = true;
    document.getElementById("ivRun").hidden = false;
    document.getElementById("ivLog").innerHTML = "";
    document.getElementById("ivProgress").textContent = `Question 1 of 6`;
    ivAppendQuestion(question);
    document.getElementById("ivInput").focus();
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
};

function ivAppendQuestion(text) {
  const d = document.createElement("div");
  d.className = "msg assistant";
  d.append(Object.assign(document.createElement("div"), { textContent: text }));
  document.getElementById("ivLog").append(d);
  document.getElementById("ivLog").scrollTop = 1e9;
  speak(text);
}

async function ivSend(text) {
  text = text.trim();
  if (!text || !ivId) return;
  document.getElementById("ivInput").value = "";
  document.getElementById("ivSend").disabled = true;

  const ua = document.createElement("div");
  ua.className = "msg user";
  ua.append(Object.assign(document.createElement("div"), { textContent: text }));
  const log = document.getElementById("ivLog");
  log.append(ua);

  const typing = document.createElement("div");
  typing.className = "msg assistant typing";
  typing.textContent = "…";
  log.append(typing);
  log.scrollTop = 1e9;

  try {
    const r = await api("/api/interview/respond", { studentId: student.id, interviewId: ivId, answer: text });
    typing.remove();

    if (r.feedback || r.corrections?.length) {
      const fc = document.createElement("div");
      fc.className = "card";
      let html = "";
      if (r.feedback) html += `<div class="g-section"><span class="g-label">Feedback</span><p style="margin:4px 0">${esc(r.feedback)}</p></div>`;
      if (r.score != null) {
        const stars = "★".repeat(r.score) + "☆".repeat(5 - r.score);
        html += `<div class="g-section"><span class="g-label">Score</span> <span class="pill">${stars} ${r.score}/5</span></div>`;
      }
      if (r.corrections?.length) {
        html += `<div class="g-section"><span class="g-label">Language corrections</span>`;
        for (const c of r.corrections) html += `<div class="fix"><s>${esc(c.original)}</s> → <b>${esc(c.corrected)}</b><br><span class="small">${esc(c.rule)}</span></div>`;
        html += `</div>`;
      }
      fc.innerHTML = html;
      log.append(fc);
    }

    if (r.done) {
      document.getElementById("ivRun").hidden = true;
      document.getElementById("ivSummary").hidden = false;
      document.getElementById("ivSummaryOut").innerHTML = `<div class="card"><h3>Interview Complete</h3><p>${esc(r.finalSummary)}</p></div>`;
      ivId = null;
    } else {
      document.getElementById("ivProgress").textContent = `Question ${r.round + 1} of ${r.total}`;
      ivAppendQuestion(r.nextQuestion);
    }
    log.scrollTop = 1e9;
  } catch (e) {
    typing.remove();
    const err = document.createElement("div");
    err.className = "msg assistant";
    err.textContent = "⚠ " + e.message;
    log.append(err);
  } finally {
    document.getElementById("ivSend").disabled = false;
    document.getElementById("ivInput").focus();
  }
}

document.getElementById("ivSend").onclick = () => ivSend(document.getElementById("ivInput").value);
document.getElementById("ivInput").addEventListener("keydown", (e) => e.key === "Enter" && ivSend(e.target.value));

document.getElementById("ivEnd").onclick = () => {
  if (!confirm("End this interview session?")) return;
  ivId = null;
  document.getElementById("ivRun").hidden = true;
  document.getElementById("ivSetup").hidden = false;
};

document.getElementById("ivAgain").onclick = () => {
  document.getElementById("ivSummary").hidden = true;
  document.getElementById("ivSetup").hidden = false;
};

if (SR) {
  const ivRec = new SR();
  ivRec.lang = "en-US";
  ivRec.interimResults = true;
  let ivListening = false;
  ivRec.onresult = (e) => {
    const t = [...e.results].map((r) => r[0].transcript).join("");
    document.getElementById("ivInput").value = t;
    if (e.results[e.results.length - 1].isFinal) ivSend(t);
  };
  ivRec.onend = ivRec.onerror = () => {
    ivListening = false;
    document.getElementById("ivMic").classList.remove("on");
    document.getElementById("ivMic").textContent = "🎤 Speak";
  };
  document.getElementById("ivMic").onclick = () => {
    if (ivListening) return ivRec.stop();
    stopVoice();
    ivListening = true;
    document.getElementById("ivMic").classList.add("on");
    document.getElementById("ivMic").textContent = "⏹ Listening…";
    ivRec.start();
  };
} else {
  document.getElementById("ivMic").disabled = true;
  document.getElementById("ivNote").textContent = "Speech recognition isn't supported in this browser. Use Chrome or Edge, or type instead.";
}

// ---- Start ----
if (student?.id) enter(student); else showWelcome();
