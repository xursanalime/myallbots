var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/db.ts
var BOX_HOURS = { 0: 0, 1: 4, 2: 24, 3: 72, 4: 168, 5: 336 };
var WORD_COLUMNS = "id, user_id, uz, eng, box, next_review, created_at";
var schemaReady = false;
var USER_COLUMNS = [
  ["notify", "INTEGER DEFAULT 1"],
  ["last_notified", "TEXT"],
  ["free_mode", "INTEGER DEFAULT 0"],
  ["xp", "INTEGER DEFAULT 0"],
  ["current_streak", "INTEGER DEFAULT 0"],
  ["longest_streak", "INTEGER DEFAULT 0"],
  ["last_active_date", "TEXT"],
  ["last_streak_warning_date", "TEXT"],
  ["last_reengagement_at", "TEXT"],
  ["last_weekly_summary_at", "TEXT"]
];
async function ensureUserColumns(db) {
  const { results } = await db.prepare("PRAGMA table_info(users)").all();
  const existing = new Set((results ?? []).map((r) => r.name));
  for (const [name, ddl] of USER_COLUMNS) {
    if (!existing.has(name)) {
      await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`).run();
    }
  }
}
__name(ensureUserColumns, "ensureUserColumns");
async function initSchema(db) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS words(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      uz TEXT NOT NULL, eng TEXT NOT NULL, box INTEGER DEFAULT 0,
      next_review TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, uz))`,
    `CREATE INDEX IF NOT EXISTS idx_u ON words(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_r ON words(user_id, box, next_review)`,
    `CREATE TABLE IF NOT EXISTS users(
      user_id INTEGER PRIMARY KEY, first_name TEXT, notify INTEGER DEFAULT 1,
      last_notified TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      free_mode INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0, last_active_date TEXT,
      last_streak_warning_date TEXT, last_reengagement_at TEXT, last_weekly_summary_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS badges(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, code TEXT NOT NULL,
      earned_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, code))`,
    `CREATE TABLE IF NOT EXISTS bot_sessions(
      user_id INTEGER PRIMARY KEY, user_state TEXT, quiz_state TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`
  ];
  await db.batch(statements.map((s) => db.prepare(s)));
  await ensureUserColumns(db);
  schemaReady = true;
}
__name(initSchema, "initSchema");
async function scalar(db, sql, params, defaultValue) {
  const row = await db.prepare(sql).bind(...params).first();
  if (!row) return defaultValue;
  const value = Object.values(row)[0];
  return value === null || value === void 0 ? defaultValue : value;
}
__name(scalar, "scalar");
function parseSynonyms(raw) {
  if (!raw) return [];
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const part of raw.split(",")) {
    const token = part.split(/\s+/).filter(Boolean).join(" ");
    if (!token) continue;
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(token);
    }
  }
  return result;
}
__name(parseSynonyms, "parseSynonyms");
function mergeSynonyms(oldRaw, newRaw) {
  const merged = parseSynonyms(oldRaw);
  const seen = new Set(merged.map((s) => s.toLowerCase()));
  let added = 0;
  for (const s of parseSynonyms(newRaw)) {
    if (!seen.has(s.toLowerCase())) {
      merged.push(s);
      seen.add(s.toLowerCase());
      added++;
    }
  }
  return [merged.join(", "), added];
}
__name(mergeSynonyms, "mergeSynonyms");
async function getAllWords(db, uid) {
  const { results } = await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? ORDER BY created_at DESC`).bind(uid).all();
  return results ?? [];
}
__name(getAllWords, "getAllWords");
async function getWordById(db, uid, wordId) {
  return await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND id=?`).bind(uid, wordId).first();
}
__name(getWordById, "getWordById");
async function addWord(db, uid, uz, eng) {
  const cleanNew = parseSynonyms(eng);
  if (cleanNew.length === 0) return "skipped";
  const row = await db.prepare("SELECT id, eng, box FROM words WHERE user_id=? AND uz=?").bind(uid, uz).first();
  if (row) {
    const [mergedStr, added] = mergeSynonyms(row.eng, eng);
    if (added === 0) return "skipped";
    await db.prepare("UPDATE words SET eng=? WHERE id=?").bind(mergedStr, row.id).run();
    return "updated";
  }
  await db.prepare("INSERT INTO words (user_id, uz, eng, box, next_review) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)").bind(uid, uz, cleanNew.join(", ")).run();
  return "added";
}
__name(addWord, "addWord");
async function updateWordEng(db, uid, wordId, newEng) {
  const cleaned = parseSynonyms(newEng).join(", ");
  await db.prepare("UPDATE words SET eng=? WHERE id=? AND user_id=?").bind(cleaned, wordId, uid).run();
}
__name(updateWordEng, "updateWordEng");
async function deleteWord(db, uid, wordId) {
  const r = await db.prepare("SELECT uz FROM words WHERE id=? AND user_id=?").bind(wordId, uid).first();
  if (!r) return null;
  await db.prepare("DELETE FROM words WHERE id=? AND user_id=?").bind(wordId, uid).run();
  return r.uz;
}
__name(deleteWord, "deleteWord");
async function deleteAll(db, uid) {
  const result = await db.prepare("DELETE FROM words WHERE user_id=?").bind(uid).run();
  return result.meta?.changes ?? 0;
}
__name(deleteAll, "deleteAll");
async function updateBox(db, uid, wordId, newBox) {
  const hours = BOX_HOURS[newBox] ?? 0;
  await db.prepare("UPDATE words SET box=?, next_review = datetime('now', '+' || ? || ' hours') WHERE id=? AND user_id=?").bind(newBox, hours, wordId, uid).run();
}
__name(updateBox, "updateBox");
async function wordsNew(db, uid) {
  const { results } = await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=0`).bind(uid).all();
  return results ?? [];
}
__name(wordsNew, "wordsNew");
async function wordsInBox(db, uid, box, dueOnly = true) {
  let sql;
  if (dueOnly && !await getFreeMode(db, uid)) {
    sql = `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=? AND next_review <= CURRENT_TIMESTAMP`;
  } else {
    sql = `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=?`;
  }
  const { results } = await db.prepare(sql).bind(uid, box).all();
  return results ?? [];
}
__name(wordsInBox, "wordsInBox");
async function wordsDue(db, uid) {
  const free = await getFreeMode(db, uid);
  const sql = free ? `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box>0` : `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box>0 AND next_review <= CURRENT_TIMESTAMP`;
  const { results } = await db.prepare(sql).bind(uid).all();
  return results ?? [];
}
__name(wordsDue, "wordsDue");
async function countBox(db, uid, box) {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=?", [uid, box], 0);
}
__name(countBox, "countBox");
async function countDueBox(db, uid, box) {
  if (await getFreeMode(db, uid)) return countBox(db, uid, box);
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=? AND next_review <= CURRENT_TIMESTAMP", [uid, box], 0);
}
__name(countDueBox, "countDueBox");
async function secondsUntilDue(db, uid) {
  return scalar(
    db,
    "SELECT (strftime('%s', MIN(next_review)) - strftime('%s', 'now')) FROM words WHERE user_id=? AND box>0",
    [uid],
    null
  );
}
__name(secondsUntilDue, "secondsUntilDue");
async function secondsUntilDueBox(db, uid, box) {
  return scalar(
    db,
    "SELECT (strftime('%s', MIN(next_review)) - strftime('%s', 'now')) FROM words WHERE user_id=? AND box=?",
    [uid, box],
    null
  );
}
__name(secondsUntilDueBox, "secondsUntilDueBox");
function escapeLike(text) {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
__name(escapeLike, "escapeLike");
async function searchWords(db, uid, query) {
  const q = (query || "").trim();
  if (!q) return [];
  const like = `%${escapeLike(q.toLowerCase())}%`;
  const { results } = await db.prepare(
    `SELECT ${WORD_COLUMNS} FROM words
       WHERE user_id=? AND (LOWER(uz) LIKE ? ESCAPE '\\' OR LOWER(eng) LIKE ? ESCAPE '\\')
       ORDER BY uz LIMIT 20`
  ).bind(uid, like, like).all();
  return results ?? [];
}
__name(searchWords, "searchWords");
async function stats(db, uid) {
  const total = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=?", [uid], 0);
  const newW = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=0", [uid], 0);
  const done = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=5", [uid], 0);
  const due = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box>0 AND next_review <= CURRENT_TIMESTAMP", [uid], 0);
  const boxes = {};
  for (let i = 1; i <= 5; i++) {
    boxes[i] = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=?", [uid, i], 0);
  }
  return { total, new: newW, done, due, boxes };
}
__name(stats, "stats");
async function registerUser(db, uid, firstName) {
  await db.prepare(
    `INSERT INTO users (user_id, first_name) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name`
  ).bind(uid, firstName ?? null).run();
}
__name(registerUser, "registerUser");
async function getNotify(db, uid) {
  const r = await db.prepare("SELECT notify FROM users WHERE user_id=?").bind(uid).first();
  return r ? !!r.notify : true;
}
__name(getNotify, "getNotify");
async function setNotify(db, uid, enabled) {
  await db.prepare(
    `INSERT INTO users (user_id, notify) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET notify=excluded.notify`
  ).bind(uid, enabled ? 1 : 0).run();
}
__name(setNotify, "setNotify");
async function getFreeMode(db, uid) {
  const r = await db.prepare("SELECT free_mode FROM users WHERE user_id=?").bind(uid).first();
  return r ? !!r.free_mode : false;
}
__name(getFreeMode, "getFreeMode");
async function setFreeMode(db, uid, enabled) {
  await db.prepare(
    `INSERT INTO users (user_id, free_mode) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET free_mode=excluded.free_mode`
  ).bind(uid, enabled ? 1 : 0).run();
}
__name(setFreeMode, "setFreeMode");
async function markNotified(db, uid) {
  await db.prepare("UPDATE users SET last_notified = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}
__name(markNotified, "markNotified");
async function usersToNotify(db, cooldownHours = 12) {
  const { results } = await db.prepare(
    `SELECT u.user_id as user_id, u.first_name as first_name, COUNT(w.id) as due_count
       FROM users u
       JOIN words w ON w.user_id = u.user_id AND w.box > 0 AND w.next_review <= CURRENT_TIMESTAMP
       WHERE u.notify = 1
         AND (u.last_notified IS NULL OR u.last_notified <= datetime('now', '-' || ? || ' hours'))
       GROUP BY u.user_id, u.first_name
       HAVING COUNT(w.id) > 0`
  ).bind(cooldownHours).all();
  return results ?? [];
}
__name(usersToNotify, "usersToNotify");
async function countWords(db, uid) {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=?", [uid], 0);
}
__name(countWords, "countWords");
async function getXp(db, uid) {
  return scalar(db, "SELECT xp FROM users WHERE user_id=?", [uid], 0);
}
__name(getXp, "getXp");
async function addXp(db, uid, amount) {
  if (amount === 0) return;
  await db.prepare(
    `INSERT INTO users (user_id, xp) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET xp = users.xp + excluded.xp`
  ).bind(uid, amount).run();
}
__name(addXp, "addXp");
async function getStreak(db, uid) {
  const r = await db.prepare("SELECT current_streak, longest_streak, last_active_date FROM users WHERE user_id=?").bind(uid).first();
  if (!r) return { current: 0, longest: 0, last_active_date: null };
  return { current: r.current_streak || 0, longest: r.longest_streak || 0, last_active_date: r.last_active_date };
}
__name(getStreak, "getStreak");
function addDaysIso(isoDate, days) {
  const d = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
__name(addDaysIso, "addDaysIso");
async function bumpStreak(db, uid) {
  const row = await db.prepare("SELECT current_streak, longest_streak, last_active_date, date('now') as today FROM users WHERE user_id=?").bind(uid).first();
  if (!row) return { streak: 0, longest: 0, changed: false };
  const cur = row.current_streak || 0;
  const longest = row.longest_streak || 0;
  const last = row.last_active_date;
  const today = row.today;
  if (last === today) return { streak: cur, longest, changed: false };
  const yesterday = addDaysIso(today, -1);
  const newStreak = last === yesterday ? cur + 1 : 1;
  const newLongest = Math.max(longest, newStreak);
  await db.prepare("UPDATE users SET current_streak=?, longest_streak=?, last_active_date=? WHERE user_id=?").bind(newStreak, newLongest, today, uid).run();
  return { streak: newStreak, longest: newLongest, changed: true };
}
__name(bumpStreak, "bumpStreak");
async function awardBadge(db, uid, code) {
  const existing = await db.prepare("SELECT 1 FROM badges WHERE user_id=? AND code=?").bind(uid, code).first();
  if (existing) return false;
  await db.prepare("INSERT INTO badges (user_id, code) VALUES (?, ?) ON CONFLICT(user_id, code) DO NOTHING").bind(uid, code).run();
  return true;
}
__name(awardBadge, "awardBadge");
async function getBadgeCodes(db, uid) {
  const { results } = await db.prepare("SELECT code FROM badges WHERE user_id=?").bind(uid).all();
  return new Set((results ?? []).map((r) => r.code));
}
__name(getBadgeCodes, "getBadgeCodes");
async function loadSession(db, uid) {
  const row = await db.prepare("SELECT user_state, quiz_state FROM bot_sessions WHERE user_id=?").bind(uid).first();
  if (!row) return { userState: null, quizState: null };
  return {
    userState: row.user_state ? JSON.parse(row.user_state) : null,
    quizState: row.quiz_state ? JSON.parse(row.quiz_state) : null
  };
}
__name(loadSession, "loadSession");
async function saveSession(db, uid, userState, quizState) {
  if (userState == null && quizState == null) {
    await db.prepare("DELETE FROM bot_sessions WHERE user_id=?").bind(uid).run();
    return;
  }
  await db.prepare(
    `INSERT INTO bot_sessions (user_id, user_state, quiz_state, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE
       SET user_state=excluded.user_state, quiz_state=excluded.quiz_state, updated_at=CURRENT_TIMESTAMP`
  ).bind(uid, userState != null ? JSON.stringify(userState) : null, quizState != null ? JSON.stringify(quizState) : null).run();
}
__name(saveSession, "saveSession");
async function leaderboard(db, limit = 10) {
  const { results } = await db.prepare("SELECT user_id, first_name, xp FROM users ORDER BY xp DESC, user_id LIMIT ?").bind(limit).all();
  return (results ?? []).map((r) => ({ user_id: r.user_id, first_name: r.first_name, xp: r.xp || 0 }));
}
__name(leaderboard, "leaderboard");
async function userRank(db, uid) {
  return scalar(
    db,
    "SELECT COUNT(*) + 1 FROM users WHERE xp > COALESCE((SELECT xp FROM users WHERE user_id=?), 0)",
    [uid],
    1
  );
}
__name(userRank, "userRank");
async function countWordsSince(db, uid, days) {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND created_at >= datetime('now', '-' || ? || ' days')", [uid, days], 0);
}
__name(countWordsSince, "countWordsSince");
async function usersStreakAtRisk(db) {
  const { results } = await db.prepare(
    `SELECT user_id, first_name, current_streak FROM users
       WHERE notify = 1 AND current_streak > 0
         AND last_active_date < date('now')
         AND (last_streak_warning_date IS NULL OR last_streak_warning_date < date('now'))`
  ).all();
  return results ?? [];
}
__name(usersStreakAtRisk, "usersStreakAtRisk");
async function markStreakWarned(db, uid) {
  await db.prepare("UPDATE users SET last_streak_warning_date = date('now') WHERE user_id=?").bind(uid).run();
}
__name(markStreakWarned, "markStreakWarned");
async function usersForReengagement(db, inactiveDays, cooldownDays) {
  const { results } = await db.prepare(
    `SELECT user_id, first_name,
              COALESCE(CAST(julianday('now') - julianday(last_active_date) AS INTEGER), 9999) as days_inactive
       FROM users
       WHERE notify = 1
         AND (last_active_date IS NULL OR last_active_date <= date('now', '-' || ? || ' days'))
         AND (last_reengagement_at IS NULL OR last_reengagement_at <= datetime('now', '-' || ? || ' days'))
         AND EXISTS (SELECT 1 FROM words w WHERE w.user_id = users.user_id)`
  ).bind(inactiveDays, cooldownDays).all();
  return results ?? [];
}
__name(usersForReengagement, "usersForReengagement");
async function markReengaged(db, uid) {
  await db.prepare("UPDATE users SET last_reengagement_at = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}
__name(markReengaged, "markReengaged");
async function usersForWeeklySummary(db) {
  const { results } = await db.prepare(
    `SELECT user_id, first_name FROM users
       WHERE notify = 1
         AND created_at <= datetime('now', '-7 days')
         AND (last_weekly_summary_at IS NULL OR last_weekly_summary_at <= datetime('now', '-7 days'))
         AND EXISTS (SELECT 1 FROM words w WHERE w.user_id = users.user_id)`
  ).all();
  return results ?? [];
}
__name(usersForWeeklySummary, "usersForWeeklySummary");
async function markWeeklySummarySent(db, uid) {
  await db.prepare("UPDATE users SET last_weekly_summary_at = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}
__name(markWeeklySummarySent, "markWeeklySummarySent");

// src/telegram.ts
function replyKeyboard(rows) {
  return { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true };
}
__name(replyKeyboard, "replyKeyboard");
function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}
__name(inlineKeyboard, "inlineKeyboard");
async function api(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}
__name(api, "api");
async function sendMessage(env, chatId, text, opts = {}) {
  const payload = { chat_id: chatId, text };
  const parseMode = opts.parseMode === void 0 ? "Markdown" : opts.parseMode;
  if (parseMode) payload.parse_mode = parseMode;
  if (opts.replyMarkup) payload.reply_markup = opts.replyMarkup;
  return api(env, "sendMessage", payload);
}
__name(sendMessage, "sendMessage");
async function answerCallbackQuery(env, callbackId, text) {
  const payload = { callback_query_id: callbackId };
  if (text) payload.text = text;
  return api(env, "answerCallbackQuery", payload);
}
__name(answerCallbackQuery, "answerCallbackQuery");
async function editMessageText(env, chatId, messageId, text, opts = {}) {
  const payload = { chat_id: chatId, message_id: messageId, text };
  const parseMode = opts.parseMode === void 0 ? "Markdown" : opts.parseMode;
  if (parseMode) payload.parse_mode = parseMode;
  if (opts.replyMarkup) payload.reply_markup = opts.replyMarkup;
  return api(env, "editMessageText", payload);
}
__name(editMessageText, "editMessageText");
async function sendDocument(env, chatId, filename, content, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "Markdown");
  }
  form.append("document", new Blob([content], { type: "text/plain; charset=utf-8" }), filename);
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form
  });
  return res.json();
}
__name(sendDocument, "sendDocument");

// src/gamification.ts
var XP_CORRECT = 10;
var XP_WORD_ADDED = 2;
var XP_BOX5_BONUS = 25;
var XP_PERFECT_TEST_BONUS = 15;
var PERFECT_TEST_MIN_TOTAL = 3;
var STREAK_BONUS_XP = { 3: 20, 7: 50, 14: 100, 30: 200, 60: 350, 100: 500 };
var LEVEL_XP_BASE = 50;
var BADGES = {
  words_1: ["\u{1F331}", "Birinchi qadam", "1-so'zingizni qo'shdingiz"],
  words_10: ["\u{1F4D7}", "Boshlovchi", "10 ta so'z qo'shdingiz"],
  words_50: ["\u{1F4D8}", "Ishtiyoqli", "50 ta so'z qo'shdingiz"],
  words_100: ["\u{1F4DA}", "Lug'atchi", "100 ta so'z qo'shdingiz"],
  master_1: ["\u{1F3C6}", "Birinchi g'alaba", "1-so'zni to'liq o'zlashtirdingiz (Quti 5)"],
  master_10: ["\u{1F451}", "Usta", "10 ta so'zni to'liq o'zlashtirdingiz"],
  streak_3: ["\u{1F525}", "Qizigan", "3 kunlik streak"],
  streak_7: ["\u{1F525}", "Bir hafta", "7 kunlik streak"],
  streak_14: ["\u{1F525}", "Ikki hafta", "14 kunlik streak"],
  streak_30: ["\u{1F48E}", "Bir oy", "30 kunlik streak"],
  streak_100: ["\u{1F31F}", "Afsonaviy", "100 kunlik streak"],
  perfect_test: ["\u{1F4AF}", "Mukammal", "Testni 100% to'g'ri yakunladingiz"]
};
var WORD_COUNT_BADGES = [
  [1, "words_1"],
  [10, "words_10"],
  [50, "words_50"],
  [100, "words_100"]
];
var MASTER_BADGES = [
  [1, "master_1"],
  [10, "master_10"]
];
var STREAK_BADGES = [
  [3, "streak_3"],
  [7, "streak_7"],
  [14, "streak_14"],
  [30, "streak_30"],
  [100, "streak_100"]
];
function xpToLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / LEVEL_XP_BASE)) + 1;
}
__name(xpToLevel, "xpToLevel");
function levelProgress(xp) {
  xp = Math.max(xp, 0);
  const level = xpToLevel(xp);
  const floorXp = LEVEL_XP_BASE * (level - 1) ** 2;
  const nextXp = LEVEL_XP_BASE * level ** 2;
  return [level, xp - floorXp, nextXp - floorXp];
}
__name(levelProgress, "levelProgress");
async function grantXp(env, uid, chatId, amount) {
  if (amount <= 0) return;
  const oldLevel = xpToLevel(await getXp(env.DB, uid));
  await addXp(env.DB, uid, amount);
  const newLevel = xpToLevel(await getXp(env.DB, uid));
  if (newLevel > oldLevel) {
    await sendMessage(env, chatId, `\u{1F389} *Tabriklaymiz! Siz ${newLevel}-darajaga yetdingiz!*`);
  }
}
__name(grantXp, "grantXp");
async function checkBadges(env, uid, thresholds, currentValue) {
  const newly = [];
  for (const [threshold, code] of thresholds) {
    if (currentValue >= threshold && await awardBadge(env.DB, uid, code)) {
      newly.push(code);
    }
  }
  return newly;
}
__name(checkBadges, "checkBadges");
async function announceBadges(env, chatId, codes) {
  for (const code of codes) {
    const [emoji, title, desc] = BADGES[code];
    await sendMessage(env, chatId, `${emoji} *Yangi yutuq: ${title}!*
_${desc}_`);
  }
}
__name(announceBadges, "announceBadges");
async function recordActivity(env, uid, chatId) {
  const res = await bumpStreak(env.DB, uid);
  if (!res.changed) return;
  const newly = await checkBadges(env, uid, STREAK_BADGES, res.streak);
  for (const code of newly) {
    const threshold = parseInt(code.split("_")[1], 10);
    const bonus = STREAK_BONUS_XP[threshold] || 0;
    const [emoji, title, desc] = BADGES[code];
    let text = `${emoji} *Yangi yutuq: ${title}!*
_${desc}_`;
    if (bonus) {
      await grantXp(env, uid, chatId, bonus);
      text += `
\u2B50 +${bonus} XP bonus!`;
    }
    await sendMessage(env, chatId, text);
  }
}
__name(recordActivity, "recordActivity");
async function onWordAdded(env, uid, chatId, addedCount) {
  if (addedCount <= 0) return;
  await grantXp(env, uid, chatId, XP_WORD_ADDED * addedCount);
  const newly = await checkBadges(env, uid, WORD_COUNT_BADGES, await countWords(env.DB, uid));
  await announceBadges(env, chatId, newly);
}
__name(onWordAdded, "onWordAdded");
async function onCorrectAnswer(env, uid, chatId, reachedBox5) {
  const xp = XP_CORRECT + (reachedBox5 ? XP_BOX5_BONUS : 0);
  await grantXp(env, uid, chatId, xp);
  await sendMessage(env, chatId, `\u2B50 +${xp} XP`);
  if (reachedBox5) {
    const newly = await checkBadges(env, uid, MASTER_BADGES, await countBox(env.DB, uid, 5));
    await announceBadges(env, chatId, newly);
  }
  await recordActivity(env, uid, chatId);
  return xp;
}
__name(onCorrectAnswer, "onCorrectAnswer");
async function onTestFinished(env, uid, chatId, pct, total) {
  if (pct === 100 && total >= PERFECT_TEST_MIN_TOTAL) {
    await grantXp(env, uid, chatId, XP_PERFECT_TEST_BONUS);
    await sendMessage(env, chatId, `\u{1F4AF} Mukammal test bonusi: +${XP_PERFECT_TEST_BONUS} XP`);
    if (await awardBadge(env.DB, uid, "perfect_test")) {
      await announceBadges(env, chatId, ["perfect_test"]);
    }
  }
}
__name(onTestFinished, "onTestFinished");

// src/bot.ts
var BOX_ICON = ["\u{1F195}", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "\u{1F3C6}"];
var PAGE_SIZE = 8;
function mainMenu() {
  return replyKeyboard([
    ["\u2795 So'z qo'shish", "\u{1F501} Takrorlash"],
    ["\u{1F3C6} Yutuqlar", "\u{1F3C5} Reyting"],
    ["\u{1F4CA} Statistika", "\u2699\uFE0F Sozlamalar"]
  ]);
}
__name(mainMenu, "mainMenu");
function backMenu() {
  return replyKeyboard([["\u{1F519} Orqaga"]]);
}
__name(backMenu, "backMenu");
async function boxMenu(env, uid) {
  const labels = [];
  for (let i = 1; i <= 5; i++) {
    const t = await countBox(env.DB, uid, i);
    const d = await countDueBox(env.DB, uid, i);
    const badge = d > 0 ? `\u{1F534}${d}` : "\u2705";
    labels.push(`\u{1F4E6} Quti ${i} (${badge}/${t})`);
  }
  return replyKeyboard([
    [labels[0], labels[1]],
    [labels[2], labels[3]],
    [labels[4], "\u{1F4DD} Test (Yangi)"],
    ["\u{1F519} Orqaga"]
  ]);
}
__name(boxMenu, "boxMenu");
function esc(text) {
  if (text === null || text === void 0) return "";
  return String(text).replace(/([_*`\[])/g, "\\$1");
}
__name(esc, "esc");
function splitPair(line) {
  for (const sep of ["=", "\u2014", "\u2013", "-"]) {
    const idx = line.indexOf(sep);
    if (idx !== -1) {
      return [line.slice(0, idx), line.slice(idx + sep.length)];
    }
  }
  return null;
}
__name(splitPair, "splitPair");
function fmtWait(seconds) {
  if (seconds === null || seconds === void 0 || seconds <= 0) return "hozir";
  const totalMin = Math.floor(seconds / 60);
  const days = Math.floor(totalMin / 1440);
  const rem = totalMin % 1440;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;
  if (days > 0) return `${days} kun ${hours} soat`;
  if (hours > 0) return `${hours} soat ${mins} daqiqa`;
  return `${mins} daqiqa`;
}
__name(fmtWait, "fmtWait");
function bar(done, total, w = 10) {
  const f = total ? Math.floor(done / total * w) : 0;
  return "\u2588".repeat(f) + "\u2591".repeat(w - f);
}
__name(bar, "bar");
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
__name(shuffle, "shuffle");
async function sendPage(env, uid, chatId, page = 0) {
  const words = await getAllWords(env.DB, uid);
  const total = words.length;
  if (total === 0) {
    await sendMessage(env, chatId, "\u{1F4ED} So'zlar ro'yxati bo'sh.", { replyMarkup: mainMenu() });
    return;
  }
  words.sort((a, b) => b.box - a.box || a.uz.localeCompare(b.uz));
  const pages = Math.ceil(total / PAGE_SIZE);
  page = Math.max(0, Math.min(page, pages - 1));
  const pageWords = words.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lines = [];
  const kbRows = [];
  let rowBtns = [];
  pageWords.forEach((w, i) => {
    const n = i + 1;
    const icon = BOX_ICON[Math.min(w.box, 5)];
    lines.push(`${n}. ${icon} *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\``);
    rowBtns.push({ text: `${n} \u270F\uFE0F`, callback_data: `edit_${w.id}` });
    rowBtns.push({ text: `${n} \u{1F5D1}`, callback_data: `del_${w.id}` });
    if (rowBtns.length === 4) {
      kbRows.push(rowBtns);
      rowBtns = [];
    }
  });
  if (rowBtns.length) kbRows.push(rowBtns);
  const text = `\u{1F4CB} *So'zlarim* \u2014 ${page + 1}/${pages} sahifa (${total} ta jami)

` + lines.join("\n");
  const navBtns = [];
  if (page > 0) navBtns.push({ text: "\u2B05\uFE0F Oldingi", callback_data: `page_${uid}_${page - 1}` });
  if (page + 1 < pages) navBtns.push({ text: "Keyingi \u27A1\uFE0F", callback_data: `page_${uid}_${page + 1}` });
  if (navBtns.length) kbRows.push(navBtns);
  await sendMessage(env, chatId, text, { replyMarkup: inlineKeyboard(kbRows) });
}
__name(sendPage, "sendPage");
async function sendWordCards(env, uid, words, header = "") {
  const lines = [];
  const kbRows = [];
  let rowBtns = [];
  words.forEach((w, i) => {
    const n = i + 1;
    const icon = BOX_ICON[Math.min(w.box, 5)];
    lines.push(`${n}. ${icon} *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\``);
    rowBtns.push({ text: `${n} \u270F\uFE0F`, callback_data: `edit_${w.id}` });
    rowBtns.push({ text: `${n} \u{1F5D1}`, callback_data: `del_${w.id}` });
    if (rowBtns.length === 4) {
      kbRows.push(rowBtns);
      rowBtns = [];
    }
  });
  if (rowBtns.length) kbRows.push(rowBtns);
  const text = header + "\n\n" + lines.join("\n");
  await sendMessage(env, uid, text, { replyMarkup: inlineKeyboard(kbRows) });
}
__name(sendWordCards, "sendWordCards");
async function settingsKb(env, uid) {
  const on = await getNotify(env.DB, uid);
  const notifyBtn = on ? { text: "\u{1F515} Bildirishnomani o'chirish", callback_data: "notify_off" } : { text: "\u{1F514} Bildirishnomani yoqish", callback_data: "notify_on" };
  const free = await getFreeMode(env.DB, uid);
  const modeBtn = free ? { text: "\u23F0 Rejalashtirilgan rejimga o'tish", callback_data: "mode_scheduled" } : { text: "\u{1F513} Erkin rejimga o'tish", callback_data: "mode_free" };
  return inlineKeyboard([
    [notifyBtn, { text: "\u{1F4CB} So'zlarim", callback_data: "settings_words" }],
    [
      { text: "\u{1F4DD} Barcha so'zlar", callback_data: "settings_all_test" },
      { text: "\u{1F50D} Qidirish", callback_data: "settings_search" }
    ],
    [
      { text: "\u{1F4E4} Eksport qilish", callback_data: "export_words" },
      { text: "\u274C Tozalash", callback_data: "clear_open" }
    ],
    [modeBtn]
  ]);
}
__name(settingsKb, "settingsKb");
async function settingsText(env, uid) {
  const on = await getNotify(env.DB, uid);
  const holat = on ? "\u{1F514} *Yoqilgan*" : "\u{1F515} *O'chirilgan*";
  const free = await getFreeMode(env.DB, uid);
  const rejim = free ? "\u{1F513} *Erkin* \u2014 istalgan vaqtda takrorlash mumkin" : "\u23F0 *Rejalashtirilgan* \u2014 faqat vaqti kelgan so'zlar takrorlanadi";
  return `\u2699\uFE0F *Sozlamalar*

\u{1F4E2} Bildirishnoma: ${holat}
\u{1F501} Takrorlash rejimi: ${rejim}

\u{1F4A1} Bildirishnoma yoqilganda, takrorlash vaqti kelgan so'zlaringiz haqida sizga avtomatik eslatma yuboriladi (rejimdan qat'i nazar).

\u{1F4A1} Erkin rejimda so'zlarni kutish vaqtisiz istalgan paytda takrorlashingiz mumkin. Rejalashtirilgan rejimda esa har bir so'z faqat o'z Leitner vaqti kelganda tayyor bo'ladi.`;
}
__name(settingsText, "settingsText");
async function startAllTest(env, session, uid, chatId) {
  const words = await getAllWords(env.DB, uid);
  if (words.length === 0) {
    await sendMessage(env, chatId, "\u{1F4ED} *So'zlar ro'yxati bo'sh!*\n\n\u{1F4A1} *\u2795 So'z qo'shish* orqali yangi so'zlar qo'shing.", {
      replyMarkup: mainMenu()
    });
    return;
  }
  const shuffled = shuffle(words);
  session.quizState = {
    words: shuffled.map((w) => [w.id, w.uz, w.eng]),
    index: 0,
    correct: 0,
    wrong: [],
    mode: "all"
  };
  await sendMessage(
    env,
    chatId,
    `\u270D\uFE0F *Barcha So'zlar \u2014 Test*

\u{1F4DA} Jami: *${words.length} ta* so'z
\u{1F4DD} _O'zbekchasi beriladi \u2014 4 ta variantdan to'g'risini tanlang. Xato bo'lsa so'z Quti 1 ga qaytadi._
\u{1F4AA} Muvaffaqiyat!`,
    { replyMarkup: backMenu() }
  );
  await askQ(env, session, uid, chatId);
}
__name(startAllTest, "startAllTest");
async function askQuiz(env, session, uid, chatId) {
  const quiz = session.quizState;
  if (!quiz) return;
  if (quiz.index >= quiz.words.length) {
    await finish(env, session, uid, chatId);
    return;
  }
  const [wid, uz, eng] = quiz.words[quiz.index];
  const correctText = parseSynonyms(eng)[0] || eng;
  const allWords = await getAllWords(env.DB, uid);
  const pool = [];
  const seen = /* @__PURE__ */ new Set([correctText.toLowerCase()]);
  for (const w of shuffle(allWords)) {
    if (w.id === wid) continue;
    const t = parseSynonyms(w.eng)[0];
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(t);
    if (pool.length >= 3) break;
  }
  const options = shuffle([correctText, ...pool]);
  quiz.currentOptions = options;
  quiz.currentCorrect = correctText;
  quiz.currentWid = wid;
  quiz.currentUz = uz;
  quiz.currentEng = eng;
  const total = quiz.words.length;
  const curI = quiz.index + 1;
  const pct = Math.floor(quiz.index / total * 100);
  const text = `*${curI}/${total}*  \`[${bar(quiz.index, total)}]\`  ${pct}%

\u{1F1FA}\u{1F1FF} *${esc(uz.toUpperCase())}*

\u2753 To'g'ri tarjimani tanlang:`;
  const kbRows = options.map((opt, i) => [{ text: opt, callback_data: `qz_${i}` }]);
  await sendMessage(env, chatId, text, { replyMarkup: inlineKeyboard(kbRows) });
}
__name(askQuiz, "askQuiz");
async function askQ(env, session, uid, chatId) {
  await askQuiz(env, session, uid, chatId);
}
__name(askQ, "askQ");
async function finish(env, session, uid, chatId) {
  const quiz = session.quizState;
  session.quizState = null;
  if (!quiz) return;
  const correct = quiz.correct;
  const wrong = quiz.wrong;
  const total = correct + wrong.length;
  const pct = total === 0 ? 0 : Math.floor(correct / total * 100);
  const rating = pct === 100 ? "\u{1F3C6} Mukammal natija!" : pct >= 80 ? "\u{1F31F} A'lo!" : pct >= 60 ? "\u{1F44D} Yaxshi!" : pct >= 40 ? "\u{1F4DA} O'rtacha" : "\u{1F4AA} Davom eting!";
  await sendMessage(
    env,
    chatId,
    `\u{1F3C1} *Test Yakunlandi!*

\u{1F4CA} \`[${bar(correct, total)}]\` *${pct}%*

\u2705 To'g'ri: *${correct}* ta
\u274C Xato:   *${wrong.length}* ta
\u{1F4DD} Jami:   *${total}* ta

${rating}`,
    { replyMarkup: mainMenu() }
  );
  await onTestFinished(env, uid, chatId, pct, total);
  if (wrong.length) {
    const lines = wrong.map(([u, e]) => `  \u2022 *${esc(u)}* \u2192 \`${esc(e)}\``).join("\n");
    await sendMessage(env, chatId, `\u{1F4CB} *Xato so'zlar \u2014 takrorlang:*

${lines}`);
  } else {
    await sendMessage(env, chatId, "\u{1F389} *Barcha javoblar to'g'ri!* Zo'r natija! \u{1F973}");
  }
}
__name(finish, "finish");
async function handleMessage(env, session, msg) {
  const chatId = msg.chat.id;
  const uid = chatId;
  const text = msg.text ?? "";
  const firstName = msg.from?.first_name;
  if (text.startsWith("/start")) {
    session.userState = null;
    session.quizState = null;
    await registerUser(env.DB, uid, firstName || "Do'stim");
    await sendMessage(
      env,
      chatId,
      `\u{1F44B} Salom, *${esc(firstName || "Do'stim")}*!

\u{1F9E0} *BRAINBRIDGE \u2014 So'z Yodlash Boti*

\u{1F4D6} Ingliz so'zlarini *Leitner tizimi* orqali samarali yodlang!

\u{1F4E6} *Takrorlash tartibi:*
Har bir quti o'z kutish vaqtiga ega: Quti 1 \u2014 4 soat, Quti 2 \u2014 1 kun, Quti 3 \u2014 3 kun, Quti 4 \u2014 7 kun, Quti 5 \u2014 14 kun.
\u2699\uFE0F *Sozlamalar*'dan istalgan paytda *Erkin rejim*ga o'tib, kutish vaqtisiz ham takrorlashingiz mumkin.

\u2705 *To'g'ri* \u2192 keyingi qutiga \u2B06\uFE0F
\u274C *Xato*   \u2192 Quti 1 ga \u2B07\uFE0F

\u{1F4A1} Boshlash uchun *\u2795 So'z qo'shish* ni bosing!`,
      { replyMarkup: mainMenu() }
    );
    return;
  }
  if (text === "\u{1F519} Orqaga") {
    session.quizState = null;
    session.userState = null;
    await sendMessage(env, chatId, "\u{1F3E0} *Bosh menyu*", { replyMarkup: mainMenu() });
    return;
  }
  if (text === "\u2699\uFE0F Sozlamalar") {
    await registerUser(env.DB, uid, firstName || null);
    await sendMessage(env, chatId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    return;
  }
  if (text === "\u2795 So'z qo'shish") {
    session.userState = "adding";
    await sendMessage(
      env,
      chatId,
      "\u270F\uFE0F *So'z Qo'shish*\n\n\u{1F4CC} *Format:* `inglizcha = o'zbekcha`\n\n\u{1F4DD} *Ko'p so'z (har qatorga birdan):*\n```\nbook = kitob\nhouse = uy\n```\n\n\u{1F517} *Sinonimlar (vergul bilan):*\n`allow, permit, let = ruxsat`\n\n\u2B07\uFE0F So'zlaringizni yuboring:",
      { replyMarkup: backMenu() }
    );
    return;
  }
  if (session.userState === "adding") {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    await registerUser(env.DB, uid, firstName || null);
    for (const rawLine of text.trim().split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const pair = splitPair(line);
      if (!pair) continue;
      let [eng, uz] = pair;
      uz = uz.trim().toLowerCase();
      eng = eng.trim().toLowerCase();
      if (!uz || !eng) {
        skipped++;
        continue;
      }
      const r = await addWord(env.DB, uid, uz, eng);
      if (r === "added") added++;
      else if (r === "updated") updated++;
      else skipped++;
    }
    session.userState = null;
    const parts = [];
    if (added) parts.push(`\u2705 *${added} ta* yangi so'z saqlandi`);
    if (updated) parts.push(`\u267B\uFE0F *${updated} ta* so'z yangilandi`);
    if (skipped) parts.push(`\u23ED *${skipped} ta* o'tkazib yuborildi`);
    await sendMessage(env, chatId, "\u{1F4CA} *Natija:*\n" + (parts.join("\n") || "\u26A0\uFE0F Hech narsa saqlanmadi."), {
      replyMarkup: mainMenu()
    });
    await onWordAdded(env, uid, chatId, added);
    return;
  }
  if (text === "\u{1F4DD} Test (Yangi)") {
    const words = await wordsNew(env.DB, uid);
    if (words.length === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Yangi so'zlar yo'q!*\n\n\u{1F4A1} *\u2795 So'z qo'shish* orqali yangi so'zlar qo'shing.", {
        replyMarkup: mainMenu()
      });
      return;
    }
    const shuffled = shuffle(words);
    session.quizState = {
      words: shuffled.map((w) => [w.id, w.uz, w.eng]),
      index: 0,
      correct: 0,
      wrong: [],
      mode: "new"
    };
    await sendMessage(env, chatId, `\u{1F3AF} *Test Boshlandi!*

\u{1F4DA} Jami: *${words.length} ta* yangi so'z
\u{1F4AA} Muvaffaqiyat!`, { replyMarkup: backMenu() });
    await askQ(env, session, uid, chatId);
    return;
  }
  if (text === "\u{1F501} Takrorlash") {
    const due = await wordsDue(env.DB, uid);
    if (due.length === 0) {
      const secs = await secondsUntilDue(env.DB, uid);
      if (secs !== null) {
        await sendMessage(
          env,
          chatId,
          `\u23F3 *Hozircha tayyor so'z yo'q.*

\u{1F550} Keyingi takrorlash: *${fmtWait(secs)}dan* so'ng

\u{1F4E6} Quyidagi qutilardan birini tanlab, qolgan aniq vaqtni ko'rishingiz mumkin:`,
          { replyMarkup: await boxMenu(env, uid) }
        );
      } else {
        await sendMessage(
          env,
          chatId,
          "\u{1F4ED} *Takrorlanadigan so'z yo'q.*\n\n\u{1F4A1} Avval *\u{1F4DD} Test (Yangi)* ni ishlatib so'zlarni qutilariga joylashtiring!",
          { replyMarkup: await boxMenu(env, uid) }
        );
      }
      return;
    }
    await sendMessage(env, chatId, `\u{1F501} *Takrorlash*

\u{1F534} Tayyor so'zlar: *${due.length} ta*

\u{1F4E6} Qutini tanlang:`, {
      replyMarkup: await boxMenu(env, uid)
    });
    return;
  }
  if (text.includes("\u{1F4E6} Quti")) {
    const match = text.match(/Quti\s+(\d)/);
    if (!match) return;
    const box = parseInt(match[1], 10);
    const words = await wordsInBox(env.DB, uid, box, true);
    if (words.length === 0) {
      const totalInBox = await countBox(env.DB, uid, box);
      if (totalInBox > 0) {
        const secs = await secondsUntilDueBox(env.DB, uid, box);
        if (secs !== null) {
          await sendMessage(env, chatId, `\u23F3 *Hali vaqt kelmagan.*

\u{1F550} Tayyor bo'ladi: *${fmtWait(secs)}dan* so'ng`, {
            replyMarkup: await boxMenu(env, uid)
          });
        }
      } else {
        await sendMessage(env, chatId, `\u{1F4ED} *Quti ${box}* da so'z yo'q.`, { replyMarkup: await boxMenu(env, uid) });
      }
      return;
    }
    const shuffled = shuffle(words);
    session.quizState = {
      words: shuffled.map((w) => [w.id, w.uz, w.eng]),
      index: 0,
      correct: 0,
      wrong: [],
      mode: `box_${box}`,
      box
    };
    await sendMessage(env, chatId, `\u{1F4E6} *Quti ${box} \u2014 Test*

\u{1F4DA} Jami: *${words.length} ta* so'z
\u{1F4AA} Davom eting!`, { replyMarkup: backMenu() });
    await askQ(env, session, uid, chatId);
    return;
  }
  if (text === "\u{1F4CA} Statistika") {
    const s = await stats(env.DB, uid);
    if (s.total === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Statistika yo'q.*\n\n\u{1F4A1} Avval so'z qo'shing!", { replyMarkup: mainMenu() });
      return;
    }
    const donePct = s.total ? Math.floor(s.done / s.total * 100) : 0;
    const boxesText = [1, 2, 3, 4, 5].map((i) => `  ${i < 5 ? "\u2523" : "\u2517"} ${BOX_ICON[i]} Quti ${i}: *${s.boxes[i] ?? 0}* ta
`).join("");
    await sendMessage(
      env,
      chatId,
      `\u{1F4CA} *Statistika*

\u{1F4DA} Jami so'zlar:      *${s.total}* ta
\u{1F195} Yangi (test yo'q): *${s.new}* ta
\u{1F534} Bugun takrorlash:  *${s.due}* ta
\u{1F3C6} Yakunlangan:       *${s.done}* ta

\u{1F4C8} Progress: \`[${bar(s.done, s.total)}]\` *${donePct}%*

\u{1F4E6} *Qutilar:*
${boxesText}`,
      { replyMarkup: mainMenu() }
    );
    return;
  }
  if (text === "\u{1F3C6} Yutuqlar") {
    const xp = await getXp(env.DB, uid);
    const [level, xpInLevel, xpSpan] = levelProgress(xp);
    const streak = await getStreak(env.DB, uid);
    const earned = await getBadgeCodes(env.DB, uid);
    const header = `\u{1F3C6} *Yutuqlaringiz*

\u2B50 XP: *${xp}*   \u{1F4C8} Daraja: *${level}*
\`[${bar(xpInLevel, xpSpan)}]\` ${xpInLevel}/${xpSpan} XP

\u{1F525} Joriy streak: *${streak.current} kun*   \u{1F3C5} Rekord: *${streak.longest} kun*

*Belgilar:*`;
    const lines = Object.entries(BADGES).map(([code, [emoji, title, desc]]) => {
      const mark = earned.has(code) ? "\u2705" : "\u{1F512}";
      return `${mark} ${emoji} *${title}* \u2014 ${desc}`;
    });
    await sendMessage(env, chatId, header + "\n" + lines.join("\n"), { replyMarkup: mainMenu() });
    return;
  }
  if (text === "\u{1F3C5} Reyting") {
    const top = await leaderboard(env.DB, 10);
    if (top.length === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Reyting hali bo'sh.*", { replyMarkup: mainMenu() });
      return;
    }
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    let inTop = false;
    const lines = top.map((u, i) => {
      const rank = i + 1;
      const medal = rank <= 3 ? medals[rank - 1] : `${rank}.`;
      const name = esc(u.first_name) || "Foydalanuvchi";
      const level = xpToLevel(u.xp);
      const marker = u.user_id === uid ? " \u{1F448}" : "";
      if (u.user_id === uid) inTop = true;
      return `${medal} ${name} \u2014 *${u.xp} XP* (Daraja ${level})${marker}`;
    });
    let text2 = "\u{1F3C5} *Reyting \u2014 TOP 10*\n\n" + lines.join("\n");
    if (!inTop) {
      const rank = await userRank(env.DB, uid);
      const myXp = await getXp(env.DB, uid);
      text2 += `

\u{1F4CD} Sizning o'ringiz: *${rank}*-o'rin (${myXp} XP)`;
    }
    await sendMessage(env, chatId, text2, { replyMarkup: mainMenu() });
    return;
  }
  if (session.userState === "searching") {
    const q = text.trim();
    if (!q) {
      await sendMessage(env, chatId, "\u26A0\uFE0F So'z kiriting yoki qidiruv so'rovini yuboring.", { replyMarkup: backMenu() });
      return;
    }
    session.userState = null;
    const words = await searchWords(env.DB, uid, q);
    if (words.length === 0) {
      await sendMessage(env, chatId, `\u{1F4ED} *"${esc(q)}"* topilmadi.

\u{1F4A1} Boshqa so'z bilan qidiring.`, { replyMarkup: mainMenu() });
      return;
    }
    await sendWordCards(env, uid, words.slice(0, 20), `\u{1F50D} *"${esc(q)}"* \u2014 ${words.length} ta natija:`);
    await sendMessage(env, chatId, "\u{1F3E0} Bosh menyu:", { replyMarkup: mainMenu() });
    return;
  }
  const st = session.userState;
  if (st !== null && typeof st === "object" && st.mode === "editing") {
    session.userState = null;
    const raw = text.trim().toLowerCase();
    const cleanedList = parseSynonyms(raw);
    if (cleanedList.length === 0) {
      await sendMessage(env, chatId, "\u26A0\uFE0F Bo'sh qoldirish mumkin emas.", { replyMarkup: mainMenu() });
      return;
    }
    const cleaned = cleanedList.join(", ");
    await updateWordEng(env.DB, uid, st.word_id, cleaned);
    await sendMessage(env, chatId, `\u2705 *${esc(st.uz)}* yangilandi!

\u{1F4CC} Yangi tarjima: \`${esc(cleaned)}\``, {
      replyMarkup: mainMenu()
    });
    return;
  }
  if (session.quizState) {
    await sendMessage(env, chatId, "\u2753 Iltimos, yuqoridagi tugmalardan birini tanlang.");
    return;
  }
  await sendMessage(env, chatId, "\u2753 Menyu tugmalaridan foydalaning.", { replyMarkup: mainMenu() });
}
__name(handleMessage, "handleMessage");
async function handleCallback(env, session, cq) {
  const message = cq.message;
  if (!message) return;
  const chatId = message.chat.id;
  const uid = chatId;
  const messageId = message.message_id;
  const data = cq.data ?? "";
  const callbackId = cq.id;
  if (data.startsWith("qz_")) {
    const idx = parseInt(data.split("_")[1], 10);
    const quiz = session.quizState;
    if (!quiz || !quiz.currentOptions) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Test tugagan yoki eskirgan.");
      return;
    }
    const selected = quiz.currentOptions[idx];
    const isCorrect = selected !== void 0 && selected.toLowerCase() === quiz.currentCorrect.toLowerCase();
    const wid = quiz.currentWid;
    const uz = quiz.currentUz;
    if (isCorrect) {
      quiz.correct += 1;
      const w = await getWordById(env.DB, uid, wid);
      const oldBox = w ? w.box : 0;
      const newBox = Math.min(oldBox + 1, 5);
      await updateBox(env.DB, uid, wid, newBox);
      const boxTxt = newBox === 5 ? "\u{1F3C6} *So'z yakunlandi!* Quti 5 ga yetdi!" : `\u{1F4E6} Quti ${oldBox} \u2192 ${newBox}`;
      try {
        await editMessageText(env, chatId, messageId, `\u2705 *To'g'ri!*

\u{1F1FA}\u{1F1FF} ${esc(uz.toUpperCase())} \u2192 \u{1F1EC}\u{1F1E7} ${esc(quiz.currentCorrect)}

${boxTxt}`);
      } catch {
      }
      await answerCallbackQuery(env, callbackId, "\u2705 To'g'ri!");
      await onCorrectAnswer(env, uid, chatId, oldBox < 5 && newBox === 5);
    } else {
      quiz.wrong.push([uz, quiz.currentEng]);
      await updateBox(env.DB, uid, wid, 1);
      try {
        await editMessageText(env, chatId, messageId, `\u274C *Xato!*

Siz tanladingiz: _${esc(selected ?? "")}_
\u2714\uFE0F To'g'ri javob: *${esc(quiz.currentCorrect)}*

\u{1F1FA}\u{1F1FF} ${esc(uz.toUpperCase())} \u2192 \u{1F1EC}\u{1F1E7} ${esc(quiz.currentCorrect)}
\u{1F4E6} \u2192 Quti 1 ga qaytarildi`);
      } catch {
      }
      await answerCallbackQuery(env, callbackId, "\u274C Xato!");
    }
    quiz.index += 1;
    quiz.currentOptions = null;
    quiz.currentCorrect = null;
    quiz.currentWid = null;
    quiz.currentUz = null;
    quiz.currentEng = null;
    await askQ(env, session, uid, chatId);
    return;
  }
  if (data === "notify_on" || data === "notify_off") {
    const enabled = data === "notify_on";
    await setNotify(env.DB, uid, enabled);
    await answerCallbackQuery(env, callbackId, enabled ? "\u{1F514} Yoqildi!" : "\u{1F515} O'chirildi!");
    try {
      await editMessageText(env, uid, messageId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    } catch {
    }
    return;
  }
  if (data === "mode_free" || data === "mode_scheduled") {
    const free = data === "mode_free";
    await setFreeMode(env.DB, uid, free);
    await answerCallbackQuery(env, callbackId, free ? "\u{1F513} Erkin rejim yoqildi!" : "\u23F0 Rejalashtirilgan rejim yoqildi!");
    try {
      await editMessageText(env, uid, messageId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    } catch {
    }
    return;
  }
  if (data === "export_words") {
    const words = await getAllWords(env.DB, uid);
    if (words.length === 0) {
      await answerCallbackQuery(env, callbackId, "\u{1F4ED} So'zlar ro'yxati bo'sh.");
      return;
    }
    words.sort((a, b) => a.uz.localeCompare(b.uz));
    const content = words.map((w) => `${w.eng} = ${w.uz}`).join("\n");
    await answerCallbackQuery(env, callbackId, "\u{1F4E4} Eksport qilinmoqda...");
    await sendDocument(env, uid, "sozlar.txt", content, `\u{1F4E4} *${words.length} ta* so'z eksport qilindi.`);
    return;
  }
  if (data === "settings_all_test") {
    await answerCallbackQuery(env, callbackId);
    await startAllTest(env, session, uid, chatId);
    return;
  }
  if (data === "settings_words") {
    await answerCallbackQuery(env, callbackId);
    await sendPage(env, uid, uid, 0);
    return;
  }
  if (data === "settings_search") {
    await answerCallbackQuery(env, callbackId);
    session.userState = "searching";
    await sendMessage(env, uid, "\u{1F50D} *Qidirish*\n\nO'zbek yoki ingliz tilida so'z kiriting:", { replyMarkup: backMenu() });
    return;
  }
  if (data === "clear_open") {
    const s = await stats(env.DB, uid);
    if (s.total === 0) {
      await answerCallbackQuery(env, callbackId, "\u{1F4ED} O'chiriladigan so'z yo'q.");
      return;
    }
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, barchasini o'chir", callback_data: "clear_step2" },
        { text: "\u274C Bekor qilish", callback_data: "clear_no" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      `\u26A0\uFE0F *Diqqat!*

*${s.total} ta* so'z butunlay o'chiriladi.
Bu amalni bekor qilib bo'lmaydi!

Rostan davom etasizmi?`,
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return;
  }
  if (data === "clear_step2") {
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, aniq o'chir", callback_data: "clear_yes" },
        { text: "\u274C Bekor qilish", callback_data: "clear_no" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      "\u{1F6A8} *Oxirgi tasdiq!*\n\nBarcha so'zlaringiz *butunlay* o'chiriladi va *hech qanday holatda* (zahira nusxa orqali ham) qaytarib bo'lmaydi.\n\nHaqiqatan ham davom etmoqchimisiz?",
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return;
  }
  if (data === "clear_yes" || data === "clear_no") {
    if (data === "clear_yes") {
      const count = await deleteAll(env.DB, uid);
      await editMessageText(env, chatId, messageId, `\u{1F5D1} *${count} ta* so'z o'chirildi.`);
      await sendMessage(env, uid, "\u{1F3E0} Bosh menyu", { replyMarkup: mainMenu() });
    } else {
      await editMessageText(env, chatId, messageId, "\u274C Bekor qilindi.", { parseMode: null });
    }
    await answerCallbackQuery(env, callbackId);
    return;
  }
  if (data.startsWith("page_")) {
    const parts = data.split("_");
    const pg = parseInt(parts[2], 10);
    await answerCallbackQuery(env, callbackId);
    await sendPage(env, uid, chatId, pg);
    return;
  }
  if (data.startsWith("del_confirm_")) {
    const wid = parseInt(data.split("_")[2], 10);
    const uz = await deleteWord(env.DB, uid, wid);
    if (!uz) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F So'z topilmadi.");
      return;
    }
    await editMessageText(env, chatId, messageId, `\u{1F5D1} *${esc(uz)}* o'chirildi.`);
    await answerCallbackQuery(env, callbackId, "\u2705 O'chirildi!");
    return;
  }
  if (data === "del_cancel") {
    await editMessageText(env, chatId, messageId, "\u274C Bekor qilindi.", { parseMode: null });
    await answerCallbackQuery(env, callbackId);
    return;
  }
  if (data.startsWith("del_")) {
    const wid = parseInt(data.split("_")[1], 10);
    const w = await getWordById(env.DB, uid, wid);
    if (!w) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Topilmadi.");
      return;
    }
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, o'chir", callback_data: `del_confirm_${wid}` },
        { text: "\u274C Bekor", callback_data: "del_cancel" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      `\u26A0\uFE0F *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\`

Bu so'z butunlay o'chiriladi va qaytarib bo'lmaydi.

Rostan o'chirmoqchimisiz?`,
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return;
  }
  if (data.startsWith("edit_")) {
    const wid = parseInt(data.split("_")[1], 10);
    const w = await getWordById(env.DB, uid, wid);
    if (!w) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Topilmadi.");
      return;
    }
    session.userState = { mode: "editing", word_id: wid, uz: w.uz };
    await answerCallbackQuery(env, callbackId);
    await sendMessage(
      env,
      uid,
      `\u270F\uFE0F *${esc(w.uz)}* \u2014 tahrirlash

\u{1F4CC} Hozirgi tarjima: \`${esc(w.eng)}\`

Yangi tarjimani yozing (sinonimlar vergul bilan):`,
      { replyMarkup: backMenu() }
    );
    return;
  }
}
__name(handleCallback, "handleCallback");
function extractChatId(update) {
  const message = update.message || update.edited_message || update.channel_post;
  if (message && message.chat) return message.chat.id;
  if (update.callback_query && update.callback_query.message) return update.callback_query.message.chat.id;
  return null;
}
__name(extractChatId, "extractChatId");
async function processWebhookUpdate(env, update) {
  await initSchema(env.DB);
  const uid = extractChatId(update);
  const session = { userState: null, quizState: null };
  if (uid !== null) {
    const loaded = await loadSession(env.DB, uid);
    session.userState = loaded.userState ?? null;
    session.quizState = loaded.quizState ?? null;
  }
  try {
    if (update.callback_query) {
      await handleCallback(env, session, update.callback_query);
    } else if (update.message) {
      await handleMessage(env, session, update.message);
    }
  } finally {
    if (uid !== null) {
      await saveSession(env.DB, uid, session.userState, session.quizState);
    }
  }
}
__name(processWebhookUpdate, "processWebhookUpdate");

// src/notifier.ts
var COOLDOWN_HOURS = 12;
var STREAK_WARNING_HOUR = 20;
var REENGAGE_INACTIVE_DAYS = 3;
var REENGAGE_COOLDOWN_DAYS = 3;
async function send(env, uid, text) {
  try {
    const res = await sendMessage(env, uid, text);
    if (res && res.ok === false) {
      const desc = String(res.description || "").toLowerCase();
      if (desc.includes("blocked") || desc.includes("deactivated") || desc.includes("chat not found")) {
        await setNotify(env.DB, uid, false);
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
__name(send, "send");
async function notifyOnce(env) {
  const targets = await usersToNotify(env.DB, COOLDOWN_HOURS);
  for (const { user_id, first_name, due_count } of targets) {
    const name = first_name || "Do'stim";
    const streak = (await getStreak(env.DB, user_id)).current;
    const streakLine = streak > 0 ? `
\u{1F525} Streak'ingiz: *${streak} kun* \u2014 uzilib qolmasin!
` : "";
    const text = `\u{1F514} *Eslatma, ${name}!*

\u{1F4DA} Takrorlash vaqti keldi: *${due_count} ta* so'z tayyor.
${streakLine}
\u{1F4A1} *\u{1F501} Takrorlash* tugmasini bosib mashq qiling!`;
    if (await send(env, user_id, text)) await markNotified(env.DB, user_id);
  }
}
__name(notifyOnce, "notifyOnce");
async function checkStreakRisk(env) {
  if ((/* @__PURE__ */ new Date()).getUTCHours() < STREAK_WARNING_HOUR) return;
  const targets = await usersStreakAtRisk(env.DB);
  for (const { user_id, first_name, current_streak } of targets) {
    const name = first_name || "Do'stim";
    const text = `\u{1F525} *Diqqat, ${name}!*

Sizning *${current_streak} kunlik* streak'ingiz bugun uzilib qolishi mumkin!

\u{1F4A1} Bir nechta so'zni takrorlab, uni saqlab qoling.`;
    if (await send(env, user_id, text)) await markStreakWarned(env.DB, user_id);
  }
}
__name(checkStreakRisk, "checkStreakRisk");
async function checkReengagement(env) {
  const targets = await usersForReengagement(env.DB, REENGAGE_INACTIVE_DAYS, REENGAGE_COOLDOWN_DAYS);
  for (const { user_id, first_name, days_inactive } of targets) {
    const name = first_name || "Do'stim";
    const text = `\u{1F44B} *Sizni sog'indik, ${name}!*

*${days_inactive} kundan* beri so'zlaringizni takrorlamadingiz.

\u{1F4A1} *\u{1F501} Takrorlash* tugmasini bosib, o'rganishni davom eting!`;
    if (await send(env, user_id, text)) await markReengaged(env.DB, user_id);
  }
}
__name(checkReengagement, "checkReengagement");
async function checkWeeklySummary(env) {
  const targets = await usersForWeeklySummary(env.DB);
  for (const { user_id, first_name } of targets) {
    const name = first_name || "Do'stim";
    const s = await stats(env.DB, user_id);
    const xp = await getXp(env.DB, user_id);
    const [level] = levelProgress(xp);
    const streak = await getStreak(env.DB, user_id);
    const newThisWeek = await countWordsSince(env.DB, user_id, 7);
    const text = `\u{1F4C5} *Haftalik xulosa, ${name}!*

\u{1F4DA} Jami so'zlar: *${s.total} ta* (shu hafta +*${newThisWeek}* ta)
\u2B50 XP: *${xp}*   \u{1F4C8} Daraja: *${level}*
\u{1F525} Joriy streak: *${streak.current} kun*   \u{1F3C5} Rekord: *${streak.longest} kun*

\u{1F4AA} Davom eting!`;
    if (await send(env, user_id, text)) await markWeeklySummarySent(env.DB, user_id);
  }
}
__name(checkWeeklySummary, "checkWeeklySummary");
async function runScheduledChecks(env) {
  await initSchema(env.DB);
  await notifyOnce(env);
  await checkStreakRisk(env);
  await checkReengagement(env);
  await checkWeeklySummary(env);
}
__name(runScheduledChecks, "runScheduledChecks");

// src/index.ts
var index_default = {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!secret || secret !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("invalid update", { status: 400 });
    }
    try {
      await processWebhookUpdate(env, update);
    } catch (err) {
      console.error("Telegram update'ni ishlashda xato:", err);
      return new Response("internal error", { status: 500 });
    }
    return new Response("ok");
  },
  async scheduled(_controller, env, _ctx) {
    await runScheduledChecks(env);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map