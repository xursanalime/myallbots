import { Env } from '../types';

export const BOX_HOURS: Record<number, number> = { 0: 0, 1: 4, 2: 24, 3: 72, 4: 168, 5: 336 };
export const WORD_COLUMNS = "id, user_id, uz, eng, box, next_review, created_at";
let schemaReady = false;

export const USER_COLUMNS = [
  ["notify", "INTEGER DEFAULT 1"],
  ["last_notified", "TEXT"],
  ["free_mode", "INTEGER DEFAULT 0"],
  ["xp", "INTEGER DEFAULT 0"],
  ["current_streak", "INTEGER DEFAULT 0"],
  ["longest_streak", "INTEGER DEFAULT 0"],
  ["last_active_date", "TEXT"],
  ["last_streak_warning_date", "TEXT"],
  ["last_reengagement_at", "TEXT"],
  ["last_weekly_summary_at", "TEXT"],
  ['ai_enabled', 'INTEGER DEFAULT 0'],
  ['timezone', "TEXT DEFAULT '+05:00'"],
  ['start_date', 'TEXT'],
  ['last_morning_date', 'TEXT'],
  ['last_evening_date', 'TEXT'],
  ['channel_id', 'TEXT'],
  ['channel_report_enabled', 'INTEGER DEFAULT 1'],
  ['last_channel_report_date', 'TEXT']
];

export async function ensureUserColumns(db: D1Database) {
  const { results } = await db.prepare("PRAGMA table_info(users)").all();
  const existing = new Set((results ?? []).map((r: any) => r.name));
  for (const [name, ddl] of USER_COLUMNS) {
    if (!existing.has(name)) {
      await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`).run();
    }
  }
}

export async function ensureHabitColumns(db: D1Database) {
  const { results } = await db.prepare("PRAGMA table_info(habits)").all();
  const existing = new Set((results ?? []).map((r: any) => r.name));
  if (!existing.has('last_reminded_date')) {
    await db.prepare("ALTER TABLE habits ADD COLUMN last_reminded_date TEXT").run();
  }
}

export async function initSchema(db: D1Database) {
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS habits(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reminder_time TEXT,
      minimum_version_text TEXT,
      if_then_plan TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, active)`,
    `CREATE TABLE IF NOT EXISTS habit_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      logged_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_habit_logs ON habit_logs(habit_id, date)`,
    `CREATE TABLE IF NOT EXISTS daily_scores(
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      total_score REAL DEFAULT 0,
      streak_count INTEGER DEFAULT 0,
      is_success_day INTEGER DEFAULT 0,
      is_full_day INTEGER DEFAULT 0,
      PRIMARY KEY(user_id, date)
    )`
  ];
  await db.batch(statements.map((s) => db.prepare(s)));
  await ensureUserColumns(db);
  await ensureHabitColumns(db);
  schemaReady = true;
}

export async function scalar(db: D1Database, sql: string, params: any[], defaultValue: any): Promise<any> {
  const row = await db.prepare(sql).bind(...params).first();
  if (!row) return defaultValue;
  const value = Object.values(row)[0];
  return value === null || value === void 0 ? defaultValue : value;
}

export function parseSynonyms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const result: string[] = [];
  const seen = new Set<string>();
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

export function mergeSynonyms(oldRaw: string, newRaw: string): [string, number] {
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

export async function getAllWords(db: D1Database, uid: number): Promise<any[]> {
  const { results } = await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? ORDER BY created_at DESC`).bind(uid).all();
  return results ?? [];
}

export async function getWordById(db: D1Database, uid: number, wordId: number): Promise<any> {
  return await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND id=?`).bind(uid, wordId).first();
}

export async function addWord(db: D1Database, uid: number, uz: string, eng: string): Promise<string> {
  const cleanNew = parseSynonyms(eng);
  if (cleanNew.length === 0) return "skipped";
  const row = await db.prepare("SELECT id, eng, box FROM words WHERE user_id=? AND uz=?").bind(uid, uz).first<any>();
  if (row) {
    const [mergedStr, added] = mergeSynonyms(row.eng, eng);
    if (added === 0) return "skipped";
    await db.prepare("UPDATE words SET eng=? WHERE id=?").bind(mergedStr, row.id).run();
    return "updated";
  }
  await db.prepare("INSERT INTO words (user_id, uz, eng, box, next_review) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)").bind(uid, uz, cleanNew.join(", ")).run();
  return "added";
}

export async function updateWordEng(db: D1Database, uid: number, wordId: number, newEng: string): Promise<void> {
  const cleaned = parseSynonyms(newEng).join(", ");
  await db.prepare("UPDATE words SET eng=? WHERE id=? AND user_id=?").bind(cleaned, wordId, uid).run();
}

export async function deleteWord(db: D1Database, uid: number, wordId: number): Promise<string | null> {
  const r = await db.prepare("SELECT uz FROM words WHERE id=? AND user_id=?").bind(wordId, uid).first<any>();
  if (!r) return null;
  await db.prepare("DELETE FROM words WHERE id=? AND user_id=?").bind(wordId, uid).run();
  return r.uz;
}

export async function deleteAll(db: D1Database, uid: number): Promise<number> {
  const result = await db.prepare("DELETE FROM words WHERE user_id=?").bind(uid).run();
  return result.meta?.changes ?? 0;
}

export async function updateBox(db: D1Database, uid: number, wordId: number, newBox: number): Promise<void> {
  const hours = BOX_HOURS[newBox] ?? 0;
  await db.prepare("UPDATE words SET box=?, next_review = datetime('now', '+' || ? || ' hours') WHERE id=? AND user_id=?").bind(newBox, hours, wordId, uid).run();
}

export async function wordsNew(db: D1Database, uid: number): Promise<any[]> {
  const { results } = await db.prepare(`SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=0`).bind(uid).all();
  return results ?? [];
}

export async function wordsInBox(db: D1Database, uid: number, box: number, dueOnly: boolean = true): Promise<any[]> {
  let sql;
  if (dueOnly && !await getFreeMode(db, uid)) {
    sql = `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=? AND next_review <= CURRENT_TIMESTAMP`;
  } else {
    sql = `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box=?`;
  }
  const { results } = await db.prepare(sql).bind(uid, box).all();
  return results ?? [];
}

export async function wordsDue(db: D1Database, uid: number): Promise<any[]> {
  const free = await getFreeMode(db, uid);
  const sql = free ? `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box>0` : `SELECT ${WORD_COLUMNS} FROM words WHERE user_id=? AND box>0 AND next_review <= CURRENT_TIMESTAMP`;
  const { results } = await db.prepare(sql).bind(uid).all();
  return results ?? [];
}

export async function countBox(db: D1Database, uid: number, box: number): Promise<number> {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=?", [uid, box], 0);
}

export async function countDueBox(db: D1Database, uid: number, box: number): Promise<number> {
  if (await getFreeMode(db, uid)) return countBox(db, uid, box);
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=? AND next_review <= CURRENT_TIMESTAMP", [uid, box], 0);
}

export async function secondsUntilDue(db: D1Database, uid: number): Promise<number | null> {
  return scalar(
    db,
    "SELECT (strftime('%s', MIN(next_review)) - strftime('%s', 'now')) FROM words WHERE user_id=? AND box>0",
    [uid],
    null
  );
}

export async function secondsUntilDueBox(db: D1Database, uid: number, box: number): Promise<number | null> {
  return scalar(
    db,
    "SELECT (strftime('%s', MIN(next_review)) - strftime('%s', 'now')) FROM words WHERE user_id=? AND box=?",
    [uid, box],
    null
  );
}

export function escapeLike(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function searchWords(db: D1Database, uid: number, query: string): Promise<any[]> {
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

export async function stats(db: D1Database, uid: number): Promise<{ total: number, new: number, done: number, due: number, boxes: Record<number, number> }> {
  const total = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=?", [uid], 0);
  const newW = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=0", [uid], 0);
  const done = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=5", [uid], 0);
  const due = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box>0 AND next_review <= CURRENT_TIMESTAMP", [uid], 0);
  const boxes: Record<number, number> = {};
  for (let i = 1; i <= 5; i++) {
    boxes[i] = await scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND box=?", [uid, i], 0);
  }
  return { total, new: newW, done, due, boxes };
}

export async function registerUser(db: D1Database, uid: number, firstName: string | null): Promise<void> {
  await db.prepare(
    `INSERT INTO users (user_id, first_name, start_date) VALUES (?, ?, date('now', '+5 hours'))
       ON CONFLICT(user_id) DO UPDATE SET 
       first_name=COALESCE(excluded.first_name, users.first_name),
       start_date=COALESCE(users.start_date, date('now', '+5 hours'))`
  ).bind(uid, firstName ?? null).run();
}

export async function getNotify(db: D1Database, uid: number): Promise<boolean> {
  const r = await db.prepare("SELECT notify FROM users WHERE user_id=?").bind(uid).first<any>();
  return r ? !!r.notify : true;
}

export async function setNotify(db: D1Database, uid: number, enabled: boolean): Promise<void> {
  await db.prepare(
    `INSERT INTO users (user_id, notify) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET notify=excluded.notify`
  ).bind(uid, enabled ? 1 : 0).run();
}

export async function getFreeMode(db: D1Database, uid: number): Promise<boolean> {
  const r = await db.prepare("SELECT free_mode FROM users WHERE user_id=?").bind(uid).first<any>();
  return r ? !!r.free_mode : false;
}

export async function setFreeMode(db: D1Database, uid: number, enabled: boolean): Promise<void> {
  await db.prepare(
    `INSERT INTO users (user_id, free_mode) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET free_mode=excluded.free_mode`
  ).bind(uid, enabled ? 1 : 0).run();
}

export async function markNotified(db: D1Database, uid: number): Promise<void> {
  await db.prepare("UPDATE users SET last_notified = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}

export async function usersToNotify(db: D1Database, cooldownHours: number = 12): Promise<any[]> {
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

export async function countWords(db: D1Database, uid: number): Promise<number> {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=?", [uid], 0);
}

export async function getXp(db: D1Database, uid: number): Promise<number> {
  return scalar(db, "SELECT xp FROM users WHERE user_id=?", [uid], 0);
}

export async function addXp(db: D1Database, uid: number, amount: number): Promise<void> {
  if (amount === 0) return;
  await db.prepare(
    `INSERT INTO users (user_id, xp) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET xp = users.xp + excluded.xp`
  ).bind(uid, amount).run();
}

export async function getStreak(db: D1Database, uid: number): Promise<{ current: number, longest: number, last_active_date: string | null }> {
  const r = await db.prepare("SELECT current_streak, longest_streak, last_active_date FROM users WHERE user_id=?").bind(uid).first<any>();
  if (!r) return { current: 0, longest: 0, last_active_date: null };
  return { current: r.current_streak || 0, longest: r.longest_streak || 0, last_active_date: r.last_active_date };
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function bumpStreak(db: D1Database, uid: number): Promise<{ streak: number, longest: number, changed: boolean }> {
  const row = await db.prepare("SELECT current_streak, longest_streak, last_active_date, date('now') as today FROM users WHERE user_id=?").bind(uid).first<any>();
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

export async function awardBadge(db: D1Database, uid: number, code: string): Promise<boolean> {
  const existing = await db.prepare("SELECT 1 FROM badges WHERE user_id=? AND code=?").bind(uid, code).first();
  if (existing) return false;
  await db.prepare("INSERT INTO badges (user_id, code) VALUES (?, ?) ON CONFLICT(user_id, code) DO NOTHING").bind(uid, code).run();
  return true;
}

export async function getBadgeCodes(db: D1Database, uid: number): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT code FROM badges WHERE user_id=?").bind(uid).all();
  return new Set((results ?? []).map((r: any) => r.code));
}

export async function loadSession(db: D1Database, uid: number): Promise<{ userState: any, quizState: any }> {
  const row = await db.prepare("SELECT user_state, quiz_state FROM bot_sessions WHERE user_id=?").bind(uid).first<any>();
  if (!row) return { userState: null, quizState: null };
  return {
    userState: row.user_state ? JSON.parse(row.user_state) : null,
    quizState: row.quiz_state ? JSON.parse(row.quiz_state) : null
  };
}

export async function saveSession(db: D1Database, uid: number, userState: any, quizState: any): Promise<void> {
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

export async function leaderboard(db: D1Database, limit: number = 10): Promise<any[]> {
  const { results } = await db.prepare("SELECT user_id, first_name, xp FROM users ORDER BY xp DESC, user_id LIMIT ?").bind(limit).all();
  return (results ?? []).map((r: any) => ({ user_id: r.user_id, first_name: r.first_name, xp: r.xp || 0 }));
}

export async function userRank(db: D1Database, uid: number): Promise<number> {
  return scalar(
    db,
    "SELECT COUNT(*) + 1 FROM users WHERE xp > COALESCE((SELECT xp FROM users WHERE user_id=?), 0)",
    [uid],
    1
  );
}

export async function countWordsSince(db: D1Database, uid: number, days: number): Promise<number> {
  return scalar(db, "SELECT COUNT(*) FROM words WHERE user_id=? AND created_at >= datetime('now', '-' || ? || ' days')", [uid, days], 0);
}

export async function usersStreakAtRisk(db: D1Database): Promise<any[]> {
  const { results } = await db.prepare(
    `SELECT user_id, first_name, current_streak FROM users
       WHERE notify = 1 AND current_streak > 0
         AND last_active_date < date('now')
         AND (last_streak_warning_date IS NULL OR last_streak_warning_date < date('now'))`
  ).all();
  return results ?? [];
}

export async function markStreakWarned(db: D1Database, uid: number): Promise<void> {
  await db.prepare("UPDATE users SET last_streak_warning_date = date('now') WHERE user_id=?").bind(uid).run();
}

export async function usersForReengagement(db: D1Database, inactiveDays: number, cooldownDays: number): Promise<any[]> {
  const { results } = await db.prepare(
    `SELECT user_id, first_name,
            CAST(julianday('now') - julianday(COALESCE(last_active_date, created_at)) AS INTEGER) as days_inactive
       FROM users
       WHERE notify = 1
         AND COALESCE(last_active_date, created_at) <= date('now', '-' || ? || ' days')
         AND (last_reengagement_at IS NULL OR last_reengagement_at <= datetime('now', '-' || ? || ' days'))
         AND EXISTS (SELECT 1 FROM words w WHERE w.user_id = users.user_id)`
  ).bind(inactiveDays, cooldownDays).all();
  return results ?? [];
}

export async function markReengaged(db: D1Database, uid: number): Promise<void> {
  await db.prepare("UPDATE users SET last_reengagement_at = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}

export async function usersForWeeklySummary(db: D1Database): Promise<any[]> {
  const { results } = await db.prepare(
    `SELECT user_id, first_name FROM users
       WHERE notify = 1
         AND created_at <= datetime('now', '-7 days')
         AND (last_weekly_summary_at IS NULL OR last_weekly_summary_at <= datetime('now', '-7 days'))
         AND EXISTS (SELECT 1 FROM words w WHERE w.user_id = users.user_id)`
  ).all();
  return results ?? [];
}

export async function markWeeklySummarySent(db: D1Database, uid: number): Promise<void> {
  await db.prepare("UPDATE users SET last_weekly_summary_at = CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
}
