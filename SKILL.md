---
name: speakeasy-english-coach
description: Teach and test English for Hindi-speaking learners - tenses, modals, passive voice, narration, non-finites, conditionals, articles and more. Use when coaching spoken English, checking grammar, classifying a sentence (tense, modal, passive, simple), translating Hindi to English, or building grammar tests that adapt to a learner's age and level.
---

# Speakeasy Academy — Grammar Skills Reference

All grammar topics covered by the Speak coach, Grammar Checker, Translator and Test modules, plus how the app around them works. Sections 1-15 are the grammar reference; the sections after "Grammar Checker" describe the app.

## App modules

| Tab | What it does | Needs AI? |
|---|---|---|
| **Speak** | Voice or text chat with an AI coach. Corrections appear as cards under your message (category, wrong → right, rule); every coach reply has a 🔊 replay button; a "Voice replies" switch turns spoken replies on or off; while the mic is on, a strip shows the words being heard. Chat is saved per student, with a running corrections count | yes |
| **Grammar** | Sentence-by-sentence analysis (see "Grammar Checker"). Live character counter + Clear button on the textarea. Six example chips. Results: score ring (% of sentences with no errors), corrected text with 📋 Copy button, per-sentence collapsible `<details>` cards each showing a green "✓ OK" or red error-count badge; error items show category → issue → fix layout | yes |
| **Test** | Multiple-choice tests on 14 topics, adaptive difficulty, graded on the server. Topic cards have emoji icons (⏰ 🔧 🔄 💬 etc.). Hero stats row shows "Tests taken" and "Best score %" from history. History shows bar-chart cards with score, level pill and formatted date. | no |
| **Discuss** | 16 group-discussion topics (points for/against, questions) and 14 preset presentation topics. AI custom-topic generator: user types 2–5 words and gets a title, opening, key ideas, structure and vocabulary. Optional **word limit** (50 / 100 / 150 / 200 / 300 / 500 words) applied to AI presentations. A **3D spinning cube** lets students pick a random topic: tap the cube to spin, the chosen topic scrolls into view and glows. "Practise with coach" opens a live speaking session | yes (generator) |
| **Group Chat** | Shared rooms where students chat; every message shows who wrote it; react with emoji, edit or delete **your own** messages; admin moderates | no |
| **Shayari** | Own tab (✒️). Two modes: **Learn** (static bank of 31 couplets by 14 poets and 20 English quotes, filterable by type and poet, each with Hindi text, Roman transliteration, English meaning, vocabulary and reactions) and **Write & share** (community wall). **AI Shayari of the Day** is generated fresh each morning (cached per calendar day) and shown as a branded card with Hindi, Roman and English. Student posts are **auto-translated to English + Hindi** by AI (≤6 s; posted immediately if AI times out). Poster's name is always shown. Reactions: 👏 Wah and ❤️. | yes (daily + translations) |
| **Interview** | Mock interview (job, IELTS, university, general): 6 questions, feedback, 1-5 score, corrections, final summary | yes |
| **Translate** | Hindi → English with word-by-word table and sentence-type classification; also a Hindi writing test graded 0-2 per sentence | yes |
| **Progress** | **Daily streak card** (🔥 N-day streak with motivational message), messages, corrections, tests, accuracy by topic and difficulty, most common speaking mistakes, grammar check history. **Vocabulary quiz** at the bottom: AI generates a personal 5-question MCQ from the student's own dictionary search history (needs ≥3 unique words); options show correct/wrong feedback in colour, final score shown | no (quiz needs AI) |
| **Dictionary** | **Word of the Day** card at the top: AI picks one interesting word per day (cached), shown with IPA pronunciation, part of speech, definition, example sentence, Hindi meaning and a usage tip. "Look up full definition →" jumps to the search. Below: full lookup via dictionaryapi.dev (Datamuse fallback). Searches logged for admin | yes (WOTD only) |
| **Admin** | Password-protected dashboard with **six tabs**: **Overview** (tiles, age groups, levels, 📢 Announcement broadcaster, 🧹 Test-account cleanup), **Students** (search, sort, filter, inactive 💤 highlights, ⬇ Export CSV, edit, notes, mute), **Search Analytics** (14-day trend chart, top words with bars, top searchers, recent 100 entries), **Daily usage** (bar chart and table), **Enquiries**, **Group chat** moderation. Storage banner shows permanent vs. temporary. | no |
| **Enquiry form** | "✉️ Send an enquiry" button in the footer. Pre-fills name, email and phone from the signed-in student's profile. On success shows a confirmation and auto-closes after 3 s. Saved for the admin and optionally emailed (SMTP) | no |
| **Footer** | Dark footer with stats pre-banner (AI / 10+ Tools / Free / 🏆 Build confidence), brand mission statement, feature list, quick-access tab buttons (Speak / Grammar / Test / Interview), tech stack tags, contact links, enquiry button and a Wittgenstein quote. Footer quick-access buttons call `openTab()` to switch sections. | no |
| **Announcement banner** | When admin posts a message, all students see a sticky yellow banner below the header on entry. Dismissible per session (sessionStorage). Managed in Admin → Overview. | no |

## Coaching rules (all AI modules)
- Be encouraging and brief. Explain the rule, not just the answer.
- Correct only real mistakes in the learner's last message; never invent errors. Ignore punctuation and capitalisation in speech-to-text input.
- When two forms are acceptable, say so instead of marking one wrong.
- Match vocabulary to the learner's level (beginner / intermediate / advanced).
- Never reveal test answers before the learner submits.
- Errors shown to students are short and friendly ("The AI service is busy… try again in a few seconds"); the technical detail goes to the server log. In Speak, a failed reply has a **↻ Try again** button that re-sends the message.

---

## 1. Tenses

| Tense | Example |
|---|---|
| Simple Present | She **writes** every day. |
| Present Continuous | She **is writing** now. |
| Present Perfect | She **has written** three books. |
| Present Perfect Continuous | She **has been writing** since morning. |
| Simple Past | She **wrote** a letter. |
| Past Continuous | She **was writing** when I called. |
| Past Perfect | She **had written** before he arrived. |
| Past Perfect Continuous | She **had been writing** for an hour. |
| Simple Future | She **will write** tomorrow. |
| Future Continuous | She **will be writing** at noon. |
| Future Perfect | She **will have written** by Friday. |
| Future Perfect Continuous | She **will have been writing** for two hours. |

---

## 2. Modal Verbs

| Modal | Meaning | Example |
|---|---|---|
| can / could | ability, possibility | She **can** swim. |
| may / might | possibility, permission | It **might** rain. |
| must | strong obligation, deduction | You **must** stop. / He **must** be tired. |
| shall / should | suggestion, obligation | You **should** rest. |
| will / would | future, habit, request | **Would** you help me? |
| need / dare | necessity, challenge | You **need not** come. |
| used to | past habit | He **used to** jog. |
| ought to | moral obligation | You **ought to** apologise. |

---

## 3. Voice

### Active Voice
Subject performs the action.
> The teacher **explained** the rule.

### Passive Voice
Subject receives the action — formed with **be + past participle**.
> The rule **was explained** by the teacher.

Passive across tenses:
- Present: *is written*
- Past: *was written*
- Future: *will be written*
- Perfect: *has been written*
- Modal: *must be written*

---

## 4. Narration (Direct & Indirect Speech)

### Rules for Indirect Speech

| Direct | Indirect |
|---|---|
| "I **am** tired." | She said she **was** tired. |
| "I **have** finished." | She said she **had** finished. |
| "I **will** come." | She said she **would** come. |
| "**Come** here!" | He told me **to come** there. |
| "**Are** you ready?" | He asked if I **was** ready. |

Pronoun, time expression, and place changes also apply.

---

## 5. Non-Finite Forms

| Form | Type | Example |
|---|---|---|
| **Infinitive** | to + verb | She wants **to learn**. |
| **Bare infinitive** | verb only | Let him **speak**. |
| **Gerund** | verb + -ing as noun | **Swimming** is healthy. |
| **Present participle** | verb + -ing as adjective/adverb | **Running** fast, he caught the bus. |
| **Past participle** | verb + -ed/-en | **Broken** glass is dangerous. |
| **Perfect participle** | having + past participle | **Having finished**, she left. |

---

## 6. Gerunds

Used as subject, object, complement, or after prepositions:
- Subject: **Reading** improves vocabulary.
- Object: She enjoys **dancing**.
- After preposition: He is good at **speaking**.
- After certain verbs: avoid, admit, suggest, keep, finish + gerund.

---

## 7. Connectors

### Coordinating Conjunctions (FANBOYS)
**for, and, nor, but, or, yet, so**
> She studied hard, **but** she failed.

### Subordinating Conjunctions
| Type | Words |
|---|---|
| Time | when, while, after, before, since, until, as soon as |
| Cause | because, since, as |
| Condition | if, unless, provided that, as long as |
| Contrast | although, even though, whereas, while |
| Purpose | so that, in order that |
| Result | so ... that, such ... that |

### Correlative Conjunctions
both...and, either...or, neither...nor, not only...but also, whether...or

### Conjunctive Adverbs
however, therefore, moreover, furthermore, consequently, nevertheless, meanwhile

### Discourse Markers
firstly, in addition, on the other hand, in conclusion, for example, in other words

---

## 8. Conditionals

| Type | Structure | Use | Example |
|---|---|---|---|
| Zero | If + present, present | Universal truth | If you heat ice, **it melts**. |
| First | If + present, will | Real future | If it rains, I **will stay** home. |
| Second | If + past, would | Unreal present/future | If I had money, I **would travel**. |
| Third | If + past perfect, would have | Unreal past | If she had studied, she **would have passed**. |
| Mixed | If + past perfect, would | Past cause, present result | If he had slept, he **would feel** better. |

---

## 9. Imperatives

Used for commands, instructions, requests, invitations:
- **Close** the door.
- **Please sit** down.
- **Don't touch** that.
- **Let's go** home. *(inclusive imperative)*
- **Let him speak**. *(third-person imperative)*

---

## 10. Articles

| Article | Use | Example |
|---|---|---|
| **a** | singular countable, first mention, consonant sound | a book, a university |
| **an** | singular countable, vowel sound | an apple, an hour |
| **the** | specific, previously mentioned, unique | the sun, the book I read |
| **zero article** | plural/uncountable general, proper nouns | Water is essential. London is big. |

---

## 11. Prepositions

| Type | Prepositions | Example |
|---|---|---|
| Time | at, on, in, since, for, by, until | at noon, on Monday, in July |
| Place | at, on, in, above, below, between, among | at home, on the table, in the room |
| Direction | to, towards, into, onto, from | go to school |
| Cause | because of, due to, owing to | absent due to illness |
| Manner | by, with, like | written by hand |

---

## 12. Subject-Verb Agreement

- Singular subject -> singular verb: *She **writes**.*
- Plural subject -> plural verb: *They **write**.*
- Collective nouns (team, class) -> usually singular.
- Either/Neither + singular noun -> singular verb.
- Either/Neither + plural noun -> plural verb.
- *There is/are* -> agrees with real subject.

---

## 13. Relative Clauses

| Type | Pronoun | Example |
|---|---|---|
| Defining | who, which, that | The man **who called** is here. |
| Non-defining | who, which (+ commas) | My father, **who is a doctor**, helped. |
| Possessive | whose | The girl **whose bag** was lost cried. |
| Place | where | The city **where I was born** is small. |
| Time | when | The day **when we met** was rainy. |

---

## 14. Comparison

| Degree | Form | Example |
|---|---|---|
| Positive | as ... as | She is **as tall as** her sister. |
| Comparative | -er / more ... than | He is **taller than** me. |
| Superlative | -est / most ... | She is **the tallest** in class. |
| Double comparative | the ... the ... | **The more** you read, **the better** you write. |

---

## 15. Question Tags

Positive statement -> negative tag:
> She is coming, **isn't she?**

Negative statement -> positive tag:
> He won't come, **will he?**

Irregular:
> I am right, **aren't I?**
> Let's go, **shall we?**
> Pass the salt, **will you?**

---

## Grammar Checker — Detected Features

The Grammar Checker analyses every sentence and reports:

| Feature | Description |
|---|---|
| Tense + Aspect | Full tense name and aspect |
| Voice | Active or passive |
| Mood | Indicative / Imperative / Subjunctive |
| Speech | Direct / Indirect |
| Conditional | Type 0-3 or mixed |
| Modals | Word + meaning |
| Non-finites | Gerund / Infinitive / Participle + function |
| Connectors | Word + connector type |
| Clauses | Main, relative, adverbial, noun clause |
| Articles | Flags incorrect article usage |
| Errors | Colour-coded by category with fix + explanation. Each error shown as a styled block: `[category] issue → fix` with an explanation line below. |

---

## Hindi → English Translator — Sentence Type

Each English sentence gets ONE category. Apply the first rule that matches:

| Priority | Category | Rule |
|---|---|---|
| 1 | **Modal** | Contains a modal or semi-modal: can, could, may, might, must, should, would, ought to, need to, have to, be able to, used to. Plain future *will/shall* is **not** modal (it is Tense: Simple Future) unless it expresses willingness, a request or a habit. |
| 2 | **Passive** | Passive voice (be + V3) |
| 3 | **Conditional** | Sentence with an if-clause |
| 4 | **Narration** | Reported speech |
| 5 | **Non-finite** | Built around an infinitive, gerund or participle phrase |
| 6 | **Tense** | A clear non-basic tense: any continuous, perfect, perfect continuous or future form |
| 7 | **Simple sentence** | A basic subject-verb(-object) statement, question or command in Simple Present or Simple Past |

Also reported per sentence: tense, modal and its meaning, voice, sentence type (statement / question / negative / command / exclamation), structure pattern (e.g. *Subject + have to + V1*), a one-line reason, and other valid translations when the Hindi is ambiguous.

Hindi can be typed in Devanagari or in Roman letters (Hinglish: *mujhe waha jana hai*). Examples:

| Hindi | English | Category |
|---|---|---|
| मुझे वहाँ जाना है। | I have to go there. | Modal (have to, obligation) |
| तुम्हें रोज़ पढ़ाई करनी चाहिए। | You should study every day. | Modal (should, advice) |
| यह किताब मेरे दोस्त ने लिखी थी। | This book was written by my friend. | Passive (Simple Past) |
| वह पिछले दो घंटे से पढ़ रहा है। | He has been studying for the last two hours. | Tense (Present Perfect Continuous) |
| वह स्कूल जाता है। | He goes to school. | Simple sentence (Simple Present) |

Avoid *कल* in exercises: it means both "yesterday" and "tomorrow". Use verb forms or other time words that remove the doubt.

**Hindi writing test:** the learner sees a Hindi sentence and types the English. The AI scores each answer **2** (correct), **1** (partly correct) or **0** (wrong) and comments on tense and grammar. The sentence bank is `backend/data/hindi_sentences.json` (each entry has Hindi, English, tense, difficulty).

---

## Test Topics

There are 14 topics and 147 questions (45 easy, 51 medium, 51 hard).

| Topic ID | Label | What is tested |
|---|---|---|
| `tense` | Tenses | All 12 tenses, sequence of tenses |
| `modals` | Modals | Modal meaning and correct form |
| `passive` | Passive voice | Passive formation across tenses |
| `narration` | Narration | Direct and indirect speech conversion |
| `nonfinites` | Non-finites | Gerund, infinitive, participle usage |
| `articles` | Articles | a / an / the / zero article |
| `prepositions` | Prepositions | Time, place, direction, cause |
| `conditionals` | Conditionals | Zero through mixed conditionals |
| `agreement` | Subject-verb agreement | Singular/plural concord |
| `relatives` | Relative clauses | Defining and non-defining clauses |
| `comparison` | Comparison | Degrees of comparison |
| `conjunctions` | Conjunctions | Coordinating, subordinating, correlative |
| `tags` | Question tags | Positive/negative tag formation |
| `translation` | Hindi → English | Choose the correct English translation of a Hindi sentence. The sentence type (Modal, Tense, Passive, Conditional, Narration, Simple sentence) is shown as a badge above the options. |

### Adaptive difficulty

Every question is tagged `easy`, `medium` or `hard`. The recommended difficulty comes from the student's level and age:

| Rule | Effect |
|---|---|
| Level sets the base | beginner → easy, intermediate → medium, advanced → hard |
| Age 11 or under | one step easier |
| Age 8 or under | always easy |
| No student known | medium |

**Auto** mode blends difficulties (share of easy / medium / hard): recommended *easy* = 70/30/0, *medium* = 25/50/25, *hard* = 10/40/50. Questions are ordered easy → hard. Choosing Easy, Medium or Hard manually gives only that difficulty. If a difficulty runs short (for example one small topic), the nearest difficulty fills the gap.

After a test of 5 or more questions, a score of 85% or more suggests the next level up, and below 40% suggests the level below.

Question format in `backend/data/questions.json`: `{ q, options[4], answer, explain, difficulty }`. Translation questions also have `hindi`, `stype` and `sdetail`. Every `answer` must be one of the `options`.

---

## Group Chat

- Rooms: General, Grammar help, Speaking practice, Group discussion. New messages, edits and reactions arrive within about 3 seconds.
- Every message shows its sender's name (yours says "· You"). The members panel lists everyone's **name only**, online first. Age, level and ID are never shared.
- **Students can:** react with 👍 ❤️ 😂 😮 🎉 👏 (tap again to remove), **edit their own** messages (shown as "edited"), and **delete their own** messages. Nobody can edit or delete another person's message. On touch screens, tap a message to show its 😊 ✏️ 🗑 buttons.
- Rules: no links (`http://`, `https://`, `www.`), 500 characters, one new message per second per student. Edits follow the same rules.
- **Admin controls (Admin tab → Group chat moderation):** switch the chat on/off, delete any message, clear a room, mute or unmute a student, post an announcement (shown with an ADMIN badge). Muted students and a switched-off chat see a banner and cannot send, edit or react.
- There is no word filter and no private messaging. A teacher should check the rooms regularly, especially with young learners.

---

## Shayari tab (✒️)

- **Its own tab** in the nav bar. A "✒️ Shayari corner" button in Group Chat jumps to it.
- **Types:** Love, Motivation, Study, Emotional, Life, Friendship, Fun. Every couplet, quote and post has one type; the screen filters by it.
- **AI Shayari of the Day:** generated fresh by the AI each calendar day and cached in `word_of_day`-style storage. Shows at the top of Learn mode with Hindi (Devanagari), Roman transliteration, English meaning and the day's theme type. Falls back to a static entry if the AI is unavailable.
- **Learn → Shayari & dohe:** 31 couplets by 14 poets (Ghalib, Mir, Iqbal, Faiz, Faraz, Parveen Shakir, Jaun Elia, Rahat Indori, Gulzar, Kabir, Rahim, Bashir Badr, Dagh, Nida Fazli). Each has the Hindi text, Roman transliteration, plain-English meaning and words to learn. Poet filter with bio, **Save** (browser), **Hear** (Hindi TTS), **Meaning** (English TTS), Copy, and a "Poetry words to know" glossary.
- **Learn → English quotes:** 20 well-known quotes, each with Hindi translation, "in simple words" and key vocabulary. Quotes only attributed to someone are marked "(attributed)".
- **Reactions:** 👏 Wah and ❤️ on every couplet, quote and wall post. Tapping the same one removes it. Built-in item counts are stored in `shayari_wall.json` under `items`.
- **Write & share — auto-translation:** when a student posts, the AI translates the text to both English and Hindi (Devanagari) within 6 seconds. Both translations are stored with the post and shown below the original text on the wall. If the AI times out the post still goes through without translations. The button reads "✦ Translating…" during the wait.
- **Write & share — general:** pick a type and language (Roman / Hindi / Urdu / English), write 8–400 characters, post. No links allowed, muted students cannot post, one post per 15 seconds. Filter by type or "My shayari". Delete your own posts. Daily theme challenge shown above the compose box. Newest 500 posts kept.
- **Author name:** always shown on every post (already stored server-side; cannot be changed by the student).
- **Content vs. student data:** `backend/data/shayari.json` (in git) holds the static bank. `shayari_wall.json` (runtime, database or `DATA_DIR`) holds all community posts. Both `word_of_day.json` (WOTD + daily shayari cache) and `shayari_wall.json` are in the RUNTIME set synced to MongoDB/Postgres.
- **Admin:** Group chat moderation tab lists the latest 100 posts with a delete button.
- API: `GET /api/shayari` (no auth), `GET /api/shayari/daily`, `GET /api/shayari/reactions`, `POST /api/shayari/items/:key/react`, `GET|POST /api/shayari/posts` (`?mine=1`, `?type=Love`), `POST /api/shayari/posts/:pid/react`, `DELETE /api/shayari/posts/:pid` (own); admin: `GET /api/admin/shayari`, `DELETE /api/admin/shayari/:pid`.

## Resume Builder (Interview tab → 📄 Resume)
- **Two ways in:** **📤 Upload old resume** (the AI rewrites it for the new job) or **✍️ Enter details** (build from scratch). Both use the same first step (target job + optional job description) and the same **contact details** (full name, phone, email, city, LinkedIn/portfolio), which are filled from the student's profile.
- **Upload:** PDF, Word (.docx) or .txt, up to 5 MB. The server reads the text out (`pdf-parse`, `mammoth`) and shows it in a box so the student can check and fix it; they can also paste text. Scanned or photographed resumes have no text and get a clear message. Old .doc files are not supported. **The file is read in memory and not saved.** An optional "What should change?" line (for example "make it shorter, for a fresher") goes to the AI too.
- **Manual:** work experience (or "Fresher"), skills, education, certificates/projects/languages, and an optional objective.
- **Result:** a paper-style page (name, contact line, headings, bullets) with **Copy**, **Download** (.txt), **Save as PDF** (opens the print dialog on a clean A4 copy), **Edit text**, "What I improved" (upload mode), tips, and a button to practise the interview for that role. The AI is told never to invent employers, degrees, dates or achievements, and the page reminds students to check everything.
- **Photo (optional):** in the contact details a student can add a picture (the phone camera or gallery works). It is cropped to a 360 px square on the device, shown on the resume page (square or round) and included in **Save as PDF**. **The photo never leaves the browser**: it is not sent to the server or the AI, and it is kept only in this browser (`rvPhoto`, `rvShape`). The .txt download is text only.
- Drafts are kept in the browser (`rvDraft`) so a refresh does not lose typing.
- API: `POST /api/resume/extract` (`filename`, base64 `data`; own 8 MB JSON limit; sign-in required) and `POST /api/resume/build` (`role, jd, fullName, phone, email, city, links, oldResume, changes, experience, skills, education, extras, objective`).

## Running and configuring the app

```
cd backend
npm install
copy .env.example .env     # then fill in the values below
```

Then from the **project root** (or from `backend/`):

```
npm start          # http://localhost:3000  (or the PORT you set in .env)
npm run dev        # same but auto-restarts on file changes
```

`backend/.env` (never commit it; it is already in `.gitignore`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | API key for the AI provider. The name says OpenAI, but any **OpenAI-compatible** provider works (Gemini, Groq, Cerebras, OpenRouter, Mistral...). |
| `OPENAI_BASE_URL` | Provider endpoint. Leave unset for OpenAI. Gemini: `https://generativelanguage.googleapis.com/v1beta/openai/`. Groq: `https://api.groq.com/openai/v1`. Cerebras: `https://api.cerebras.ai/v1`. |
| `OPENAI_MODEL` | Main model, e.g. `gemini-flash-lite-latest` |
| `OPENAI_FALLBACK_MODEL` | One or more backup models, comma-separated (e.g. `gemini-flash-latest`), tried in order when the main model is overloaded (429/5xx), retired (404) or times out |
| `ADMIN_PASSWORD` | Enables the Admin tab. If unset, admin is disabled. |
| `PORT` | Default 5000 locally. Render sets it automatically. |
| `DATABASE_URL` | Postgres connection string (free at neon.tech or Supabase). **Set this on Render**; it keeps students, chats, scores, group chat and enquiries across restarts and redeploys. Without it they are saved as files, which a temporary disk loses. |
| `MONGODB_URL` (or `MONGODB_URI`) | MongoDB connection string, e.g. a free MongoDB Atlas cluster: `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/Speakeasy?appName=Cluster0`. **Takes priority over `DATABASE_URL`.** The database name is taken from the address (or `MONGODB_DB`, default `speakeasy`). Data goes in one collection, `app_files`. `mongodb://localhost:27017/` only works on your own PC, never on Render. In Atlas create a database user and allow `0.0.0.0/0` under Network Access (Render has no fixed address). If your network cannot resolve `mongodb+srv` addresses, the server falls back to public DNS automatically. |
| `ADMIN_TZ` | Time zone that decides where each day starts in Daily usage (default `Asia/Kolkata`) |
| `DATA_DIR` | Optional folder for saved data (for example a Render Persistent Disk at `/var/data`). Question and topic files always stay in `backend/data`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ENQUIRY_TO` | Optional. When set, every enquiry is also emailed to `ENQUIRY_TO`. Gmail: `smtp.gmail.com`, 587, your address, and a 16-character App password. `ENQUIRY_FROM` sets the sender name. |

Notes:
- Without an AI key only the Speak, Grammar, Interview and Translate features fail. Tests, Discuss, Group Chat, Dictionary, Progress and Admin still work.
- Free tiers have request limits and can return 429 or 503 ("high demand"). Each attempt times out after 20 s. The server tries every model in order, waits about a second, and makes one more pass before giving up. A bad key stops immediately. Students then see a short message, not the provider's raw error.
- Model names get retired (for example `gemini-2.0-flash`). `gemini-flash-lite-latest` and `gemini-flash-latest` are aliases that follow the current model. If the message says "The AI model isn't available", update `OPENAI_MODEL` / `OPENAI_FALLBACK_MODEL`.
- On Gemini free tiers, submitted text may be used by the provider to improve its products. Tell students, or use a paid key.
- **Where data lives:** with `MONGODB_URL` set (MongoDB) or `DATABASE_URL` set (Postgres; MongoDB wins if both are set), saved data (students, chats, scores, searches, group chat, enquiries) is kept in a Postgres table or MongoDB collection called `app_files`, one record per former file, and loaded into memory at start. Changes are written within a fraction of a second and again on shutdown. Without it, the same data is saved as JSON files in `DATA_DIR` (default `backend/data/`): `students.json`, `chats/`, `results.json`, `tr_results.json`, `groupchat.json`, `searches.json`, `grammar_checks.json`, `enquiries.json`. The content files `questions.json`, `discussion.json` and `hindi_sentences.json` always come from the repository.
- Only **one server** should use a given database at a time: each keeps the data in memory and writes it back, so two servers (for example a test copy and the real one) overwrite each other. Test scripts must start with `MONGODB_URL=` and `DATABASE_URL=` empty.
- If the database cannot be reached at start, the site still starts, falls back to files, and the Admin tab shows a red warning that data is not permanent.
- `IMPORT_LOCAL_DATA=true` (one time, with an empty database) copies existing local JSON files into the database.

### Admin: block students and time limits
- **Edit** (Students tab) changes a student's name, age, level, city, phone, email and private notes, and has an **Access** section:
  - **Block** a student, with an optional message they will see. A blocked student cannot sign in or use any AI, test or chat feature; every protected route answers 403 `{code:"blocked"}`. **Unblock** restores access. Students-table rows also have a one-click Block / Unblock button and a "Blocked" filter and tile.
  - **Daily time limit** in minutes for that student (blank = use the default, 0 = no limit). Time counts from the 15-second heartbeat. When it runs out the app shows a lock screen with a countdown to tomorrow (a "day" follows `ADMIN_TZ`), and routes answer 403 `{code:"limit"}`.
  - **+15 / +30 minutes today** grants extra time for today only; "remove extra time" takes it back. A lifted lock opens by itself within about 15 seconds.
- **Default daily limit for everyone** is set on the Students tab and stored in `settings.json`. A student's own limit wins over it.
- Students see "⏱ N min left today" in the Speak header, which turns amber when time is nearly up.
- Because there are no passwords, a blocked student could register again under a different name. The block is per name.
- API: `POST /api/admin/students/:id/access` (`blocked`, `blockReason`, `dailyLimitMin`, `addMinutesToday`, `clearExtra`), `POST /api/admin/settings` (`defaultDailyLimitMin`), `PATCH /api/admin/students/:id`, `GET /api/students/:id/status` (used by the student app).

### Admin: delete students
- On the Students tab every row has a checkbox, and the header checkbox ticks everything currently shown (filters and search still apply, and hidden rows are never selected). A red bar appears with **Delete selected** and **Clear**. Each row also has a 🗑 button for one student.
- **Select test accounts** ticks accounts whose name or id starts with Test, Demo or Zz, to clear out leftovers from testing.
- A confirmation lists the names. Deleting removes the student **and everything they created**: chat history, test scores, Hindi tests, grammar checks, searches, group-chat messages and their reactions, shayari posts and reactions, and their rows in the daily-usage history. It cannot be undone.
- The Overview tab's older "Find & remove" button deletes all name-pattern test accounts at once, using the same cleanup.
- API: `POST /api/admin/students/delete` with `{ "ids": [...] }` (up to 300), admin key required.
- With a shared database, only one server should be running against it, because each keeps the data in memory and writes it back. A second, older server can bring deleted records back.

### Admin: Daily usage
- Each day the server records, per student: seconds on site (from the 15-second heartbeat), sign-ins, Speak messages, grammar tests, Hindi writing tests, grammar checks, dictionary searches and group-chat messages. One small file per day: `usage/YYYY-MM-DD.json` (a database row each when `DATABASE_URL` is set). A "day" runs midnight to midnight in `ADMIN_TZ`.
- The tab shows a bar chart (minutes, or number of active students) for 7, 14, 30 or 90 days, summary tiles (today, yesterday, average, busiest day), and a day-by-day table. Click a day to see who was active and what each person did. Pick one student in the drop-down to see only their days.
- The first time the server starts with this feature it rebuilds past days from dated data it already has (sign-ups, tests, messages, searches, group chat). **Time on site was never recorded per day before, so it only counts from then on.**
- **History needs permanent storage.** Without `DATABASE_URL` on a host with a temporary disk (Render's free plan), the daily files are erased on every restart like the rest of the student data.
- Admin API: `GET /api/admin/usage?days=30&student=<id>`, `GET /api/admin/usage/:date`.

### Students and privacy
- A student signs in with a **name, age and level**. There is no password: anyone who types the same name gets that student's data. Use this only for a classroom or demo.
- If the server no longer knows a signed-in student (for example after its data was reset), the app quietly signs them in again from the name, age and level saved in the browser instead of showing the sign-in box.
- Private admin notes are never sent to students. The Grammar and Translate routes now require a signed-in student, like the other AI routes.
- Login is persisted in `localStorage` — the student stays signed in across browser restarts and refreshes until they click **Logout**. The **Speak** tab has a **Clear chat** button that deletes the conversation history (test scores are unaffected).
- Time on site is counted from a 15-second heartbeat while the tab is visible; the server caps what it credits, so it can't be inflated.
- Student files (`students.json`, `chats/`, `groupchat.json`, `searches.json`, `results.json`, `tr_results.json`, `grammar_checks.json`) hold real names and ages. They are listed in `backend/.gitignore` so new commits skip them. See "Deploying" for what to do if they were committed earlier.

### Phones, tablets and touch screens
- **Phones (≤ 760 px):** the tabs are a bar fixed to the bottom of the screen (icon + label, scrolls sideways). The header is one slim row (logo, name, Logout, admin, theme). Inputs are 16 px so iPhones don't zoom in, buttons have at least a 44 px touch target, and chat areas fill the screen height. The mic button is just an icon and hints are shorter; both switch back when the window is made wider.
- **Full-screen sections (phones):** Speak, Group chat and a running Interview fill the screen height; the page does not scroll, only the message list does (and it jumps to the newest message, also when the keyboard opens). The bottom tab bar **hides** while you swipe up or type and returns on swipe down, on a tab change, or from the small ⌃ handle. While typing, the coach header and group members fold away. The script sets `--hdr` (header height), `--vh` (visible height) and `--navh` (tab bar height) and the classes `nav-hidden` and `kbd`, plus `body[data-fill]`, at the end of `app.js`.
- **Tablets (≤ 1100 px):** the tab bar gets its own row under the header and scrolls sideways; the chosen tab scrolls into view (only the bar moves, never the page).
- **Touch only (no hover):** tapping a group-chat message shows its react / edit / delete buttons.
- **Stacking order:** header 10, tab bar 40, stop-voice button 45, sign-in boxes and overlays 300, toasts 310.
- The Admin tab uses the HTML `hidden` attribute; `nav button[hidden] { display:none !important }` keeps it hidden.
- There is no ☰ menu. An earlier drawer-style menu was replaced by the always-visible tab bar.

### Deploying
- **One Render Web Service (simplest):** `render.yaml` describes it. Root Directory `backend`, build `npm install`, start `node server.js`. The server also serves the `Frontend` folder, so one address serves both the page and the API. Set the variables from the table above in the Render dashboard; they are not in git.
- **Optional Vercel frontend:** `Frontend/vercel.json` forwards `/api/*` to the Render address, so the page code needs no changes. In Vercel set Root Directory to `Frontend`, Framework Preset *Other*, and leave Install and Build commands empty. Update the address in `vercel.json` if the Render URL changes.
- **Two Render services?** Vercel's `Frontend/vercel.json` names one Render address. Set the database variable on **that** service, not another one.
- **Free Render plan:** the service sleeps when idle (the first request can take a minute) and its disk is wiped on every restart and deploy. **Student data is lost unless `DATABASE_URL` is set.** Setup: either create a free MongoDB Atlas cluster and set `MONGODB_URL`, or create a free project at neon.tech, copy the connection string (it ends in `?sslmode=require`), add it to the Render service as `DATABASE_URL`, redeploy. The Admin tab then shows "💾 Student data is saved in the database".
- **Public repository warning:** files committed before `.gitignore` listed them stay in git history. If student files were committed, run `git rm --cached` on them and make the repository private.

### Main API routes
- Students: `POST /api/login`, `GET /api/students/:id/{chat,progress,difficulty,grammar-history}`, `DELETE /api/students/:id/chat`, `POST /api/students/:id/ping`
- AI: `POST /api/chat`, `POST /api/grammar`, `POST /api/translate`, `POST /api/interview/{start,respond}`, `POST /api/presentation/generate`
- Tests: `GET /api/topics`, `GET /api/test`, `POST /api/test/submit`, `GET /api/results`, `GET /api/translate-test`, `POST /api/translate-test/submit`, `GET /api/tr-results`
- Content and logging: `GET /api/discussion`, `POST /api/log/search`
- Dictionary / Word of the Day: `GET /api/word-of-day` (AI word cached per calendar day in `word_of_day.json`; no auth required)
- Vocab quiz: `GET /api/students/:id/vocab-quiz` (student auth required; needs ≥3 unique searched words; AI generates 5 MCQs)
- Announcement: `GET /api/announcement` (public); `POST /api/admin/announcement` (set message); `DELETE /api/admin/announcement` (clear)
- Shayari: `GET /api/shayari` (no auth), `GET /api/shayari/daily` (AI daily shayari, cached per day), `GET /api/shayari/reactions`, `POST /api/shayari/items/:key/react`, `GET|POST /api/shayari/posts` (`?mine=1`, `?type=Love`), `POST /api/shayari/posts/:pid/react`, `DELETE /api/shayari/posts/:pid` (own)
- Enquiries: `POST /api/enquiry` (public; hidden spam field, 5 per hour per visitor); admin: `GET /api/admin/enquiries`, `POST /api/admin/enquiries/:eid/status`, `DELETE /api/admin/enquiries/:eid`
- Group chat: `GET|POST /api/groupchat/:room`, `PATCH /api/groupchat/:room/:msgId` (edit own), `POST /api/groupchat/:room/:msgId/react`, `DELETE /api/groupchat/:room/:msgId` (own message; the admin key also works, used by the Admin tab)
- Access: `GET /api/students/:id/status`, `POST /api/admin/students/:id/access`, `POST /api/admin/settings`, `PATCH /api/admin/students/:id`; usage: `GET /api/admin/usage`, `GET /api/admin/usage/:date`
- Admin (header `x-admin-key`): `GET /api/admin/summary` (includes 14-day search trend, unique words, total searchers), `GET /api/admin/groupchat`, `POST /api/admin/groupchat/enabled`, `POST /api/admin/groupchat/:room/announce`, `DELETE /api/admin/groupchat/:room`, `POST /api/admin/students/:id/mute`, `GET /api/admin/users/:id/tests`, `GET /api/admin/shayari`, `DELETE /api/admin/shayari/:pid`, `GET /api/admin/test-users` (list accounts matching test/demo/fake patterns), `DELETE /api/admin/test-users` (bulk-delete all such accounts)
