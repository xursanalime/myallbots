import { Env, HabitRow, HabitLogRow, HabitStatus, DailyScoreRow } from '../types';

export async function createHabit(db: D1Database, userId: number, name: string, reminderTime?: string | null, minimumText?: string | null, ifThenPlan?: string | null): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO habits (user_id, name, reminder_time, minimum_version_text, if_then_plan) 
     VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).bind(userId, name, reminderTime || null, minimumText || null, ifThenPlan || null).first();
  return result?.id as number;
}

export async function getActiveHabits(db: D1Database, userId: number): Promise<HabitRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY created_at ASC`
  ).bind(userId).all<HabitRow>();
  return results || [];
}

export async function deactivateHabit(db: D1Database, habitId: number, userId: number): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE habits SET active = 0 WHERE id = ? AND user_id = ?`
  ).bind(habitId, userId).run();
  return result.success;
}

export async function logHabit(db: D1Database, habitId: number, date: string, status: HabitStatus, note?: string | null): Promise<void> {
  await db.prepare(
    `INSERT INTO habit_logs (habit_id, date, status, note, logged_at) 
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(habit_id, date) DO UPDATE SET 
     status = excluded.status, 
     note = excluded.note, 
     logged_at = CURRENT_TIMESTAMP`
  ).bind(habitId, date, status, note || null).run();
}

export async function getHabitLogsForDate(db: D1Database, userId: number, date: string): Promise<Array<HabitRow & { status: HabitStatus; log_note: string | null }>> {
  const { results } = await db.prepare(
    `SELECT h.*, 
            COALESCE(hl.status, 'pending') as status, 
            hl.note as log_note 
     FROM habits h 
     LEFT JOIN habit_logs hl ON h.id = hl.habit_id AND hl.date = ? 
     WHERE h.user_id = ? AND h.active = 1 
     ORDER BY h.created_at ASC`
  ).bind(date, userId).all<HabitRow & { status: HabitStatus; log_note: string | null }>();
  return results || [];
}

export async function getHabitHistory(db: D1Database, habitId: number, days: number): Promise<HabitLogRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM habit_logs 
     WHERE habit_id = ? AND date >= date('now', '-' || ? || ' days') 
     ORDER BY date DESC`
  ).bind(habitId, days).all<HabitLogRow>();
  return results || [];
}

export async function calculateAndSaveDailyScore(db: D1Database, userId: number, date: string): Promise<DailyScoreRow> {
  const logs = await getHabitLogsForDate(db, userId, date);
  const habitCount = logs.length;
  
  if (habitCount === 0) {
    const defaultScore: DailyScoreRow = {
      user_id: userId,
      date: date,
      total_score: 0,
      habit_count: 0,
      is_success_day: 0,
      is_full_day: 0,
      streak_count: 0
    };
    await db.prepare(
      `INSERT INTO daily_scores (user_id, date, total_score, is_success_day, is_full_day, streak_count)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
       total_score = excluded.total_score,
       is_success_day = excluded.is_success_day,
       is_full_day = excluded.is_full_day,
       streak_count = excluded.streak_count`
    ).bind(userId, date, 0, 0, 0, 0).run();
    return defaultScore;
  }

  let totalScore = 0;
  for (const log of logs) {
    if (log.status === 'done') totalScore += 1.0;
    else if (log.status === 'minimum') totalScore += 0.5;
  }

  const isSuccessDay = totalScore >= 0.5 * habitCount ? 1 : 0;
  const isFullDay = totalScore === habitCount ? 1 : 0;

  // Calculate streak count (recalculating from yesterday)
  let streakCount = isSuccessDay;
  if (isSuccessDay === 1) {
    const yesterday = new Date(new Date(date).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevScore = await db.prepare(
      `SELECT streak_count FROM daily_scores WHERE user_id = ? AND date = ?`
    ).bind(userId, yesterday).first<{ streak_count: number }>();
    
    if (prevScore && prevScore.streak_count > 0) {
      streakCount = prevScore.streak_count + 1;
    }
  }

  const scoreObj: DailyScoreRow = {
    user_id: userId,
    date: date,
    total_score: totalScore,
    habit_count: habitCount,
    is_success_day: isSuccessDay,
    is_full_day: isFullDay,
    streak_count: streakCount
  };

  await db.prepare(
    `INSERT INTO daily_scores (user_id, date, total_score, is_success_day, is_full_day, streak_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
     total_score = excluded.total_score,
     is_success_day = excluded.is_success_day,
     is_full_day = excluded.is_full_day,
     streak_count = excluded.streak_count`
  ).bind(
    userId, date, totalScore, isSuccessDay, isFullDay, streakCount
  ).run();

  return scoreObj;
}

export async function getHabitsNeedingReminder(db: D1Database, currentTime: string, currentDate: string): Promise<Array<HabitRow & { first_name: string | null }>> {
  const { results } = await db.prepare(
    `SELECT h.*, u.first_name 
     FROM habits h 
     JOIN users u ON h.user_id = u.user_id 
     WHERE h.active = 1 
       AND u.notify = 1 
       AND h.reminder_time IS NOT NULL
       AND h.reminder_time <= ?
       AND (h.last_reminded_date IS NULL OR h.last_reminded_date != ?)
       AND NOT EXISTS (
         SELECT 1 FROM habit_logs hl 
         WHERE hl.habit_id = h.id 
           AND hl.date = ? 
           AND hl.status IN ('done', 'minimum')
       )`
  ).bind(currentTime, currentDate, currentDate).all<HabitRow & { first_name: string | null }>();
  return results || [];
}

export async function markHabitReminded(db: D1Database, habitId: number, date: string): Promise<void> {
  await db.prepare("UPDATE habits SET last_reminded_date = ? WHERE id = ?").bind(date, habitId).run();
}

export async function markMorningMessageSent(db: D1Database, userId: number, date: string): Promise<void> {
  await db.prepare("UPDATE users SET last_morning_date = ? WHERE user_id = ?").bind(date, userId).run();
}

export async function markEveningMessageSent(db: D1Database, userId: number, date: string): Promise<void> {
  await db.prepare("UPDATE users SET last_evening_date = ? WHERE user_id = ?").bind(date, userId).run();
}

export async function getHabitsForLaterReminder(db: D1Database, date: string): Promise<Array<{habit_id: number; user_id: number; habit_name: string; first_name: string | null}>> {
  const { results } = await db.prepare(
    `SELECT h.id as habit_id, h.user_id, h.name as habit_name, u.first_name 
     FROM habits h 
     JOIN habit_logs hl ON h.id = hl.habit_id 
     JOIN users u ON h.user_id = u.user_id 
     WHERE h.active = 1 
       AND u.notify = 1 
       AND hl.date = ? 
       AND hl.status = 'later' 
       AND hl.logged_at >= datetime('now', '-2 hours') 
       AND hl.logged_at <= datetime('now', '-45 minutes')`
  ).bind(date).all<{habit_id: number; user_id: number; habit_name: string; first_name: string | null}>();
  return results || [];
}

export async function getUsersForTimeMessage(db: D1Database): Promise<Array<{user_id: number; first_name: string | null; start_date: string | null; ai_enabled: number; last_morning_date: string | null; last_evening_date: string | null}>> {
  const { results } = await db.prepare(
    `SELECT user_id, first_name, COALESCE(start_date, date('now', '+5 hours')) as start_date, 
            COALESCE(ai_enabled, 0) as ai_enabled, last_morning_date, last_evening_date
     FROM users 
     WHERE notify = 1`
  ).bind().all<any>();
  return results || [];
}

export async function setChannelId(db: D1Database, userId: number, channelId: string | null): Promise<void> {
  await db.prepare('UPDATE users SET channel_id = ? WHERE user_id = ?').bind(channelId, userId).run();
}

export async function setChannelReportEnabled(db: D1Database, userId: number, enabled: boolean): Promise<void> {
  await db.prepare('UPDATE users SET channel_report_enabled = ? WHERE user_id = ?').bind(enabled ? 1 : 0, userId).run();
}

export async function markChannelReportSent(db: D1Database, userId: number, date: string): Promise<void> {
  await db.prepare('UPDATE users SET last_channel_report_date = ? WHERE user_id = ?').bind(date, userId).run();
}

export async function getUsersForChannelReport(db: D1Database, currentDate: string): Promise<Array<{user_id: number; first_name: string | null; channel_id: string; ai_enabled: number; start_date: string | null}>> {
  const { results } = await db.prepare(
    `SELECT user_id, first_name, channel_id, COALESCE(ai_enabled, 0) as ai_enabled, 
            COALESCE(start_date, date('now', '+5 hours')) as start_date
     FROM users 
     WHERE channel_id IS NOT NULL 
       AND COALESCE(channel_report_enabled, 1) = 1
       AND (last_channel_report_date IS NULL OR last_channel_report_date != ?)`
  ).bind(currentDate).all<any>();
  return results || [];
}

