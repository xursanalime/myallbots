import { Env, HabitRow, DailyScoreRow } from '../types';
import { getHabitLogsForDate } from './db';

export interface HabitStatsResult {
  totalDays: number;
  overallScore: number;
  currentStreak: number;
  longestStreak: number;
  successDays: number;
  fullDays: number;
  perHabit: HabitProgress[];
}

export interface HabitProgress {
  habitId: number;
  habitName: string;
  currentStreak: number;
  periodProgress: Record<number, number>;
}

export function getCurrentDate(timezoneOffset: string = '+05:00'): string {
  // Approximate conversion for +05:00, or just use UTC and add 5 hours
  const date = new Date();
  date.setTime(date.getTime() + 5 * 60 * 60 * 1000); // add 5 hours
  return date.toISOString().split('T')[0];
}

export function calculateDayNumber(startDate: string, currentDate: string): number {
  const start = new Date(startDate);
  const current = new Date(currentDate);
  const diffTime = Math.abs(current.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 1-indexed
}

export async function getHabitStats(db: D1Database, userId: number, startDate: string): Promise<HabitStatsResult> {
  const today = getCurrentDate();
  const totalDays = calculateDayNumber(startDate, today);

  const { results: dailyScores } = await db.prepare(
    `SELECT * FROM daily_scores WHERE user_id = ? ORDER BY date DESC`
  ).bind(userId).all<DailyScoreRow>();

  let currentStreak = 0;
  let longestStreak = 0;
  let successDays = 0;
  let fullDays = 0;
  let totalScoreSum = 0;
  let habitCountSum = 0;

  if (dailyScores && dailyScores.length > 0) {
    let streakActive = true;
    let tempLongest = 0;

    for (let i = 0; i < dailyScores.length; i++) {
      const score = dailyScores[i];
      if (score.is_success_day) {
        successDays++;
        if (streakActive) currentStreak++;
        tempLongest++;
        if (tempLongest > longestStreak) longestStreak = tempLongest;
      } else {
        if (streakActive && score.date !== today) {
          // If we break the streak, only break it if it's not today (maybe today isn't done yet)
          // Actually, strict streak calculation:
          streakActive = false;
        }
        tempLongest = 0;
      }

      if (score.is_full_day) fullDays++;
      totalScoreSum += score.total_score;
      habitCountSum += score.habit_count;
    }
  }

  const overallScore = habitCountSum > 0 ? (totalScoreSum / habitCountSum) * 100 : 0;

  // Per habit logic
  const perHabit: HabitProgress[] = [];
  const { results: activeHabits } = await db.prepare(
    `SELECT * FROM habits WHERE user_id = ? AND active = 1`
  ).bind(userId).all<HabitRow>();

  if (activeHabits) {
    for (const habit of activeHabits) {
      const { results: logs } = await db.prepare(
        `SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 30`
      ).bind(habit.id).all<{ date: string; status: string }>();

      let habitStreak = 0;
      let habitStreakActive = true;
      const periods = [7, 14, 30];
      const periodStats: Record<number, { count: number, total: number }> = {
        7: { count: 0, total: 0 },
        14: { count: 0, total: 0 },
        30: { count: 0, total: 0 }
      };

      if (logs) {
        let dayCounter = 0;
        for (const log of logs) {
          const isDone = log.status === 'done' || log.status === 'minimum';
          
          if (habitStreakActive) {
            if (isDone) habitStreak++;
            else if (log.date !== today) habitStreakActive = false;
          }

          dayCounter++;
          for (const period of periods) {
            if (dayCounter <= period) {
              periodStats[period].total++;
              if (isDone) periodStats[period].count++;
            }
          }
        }
      }

      const periodProgress: Record<number, number> = {};
      for (const period of periods) {
        const stats = periodStats[period];
        periodProgress[period] = stats.total > 0 ? (stats.count / stats.total) * 100 : 0;
      }

      perHabit.push({
        habitId: habit.id,
        habitName: habit.name,
        currentStreak: habitStreak,
        periodProgress
      });
    }
  }

  return {
    totalDays,
    overallScore: Math.round(overallScore),
    currentStreak,
    longestStreak,
    successDays,
    fullDays,
    perHabit
  };
}

export function formatStatsMessage(stats: HabitStatsResult): string {
  let text = `📊 *Odatlar statistikasi*\n\n`;
  text += `🎯 Umumiy ball: ${stats.overallScore}%\n`;
  text += `📆 O'tgan kunlar: ${stats.totalDays} kun\n`;
  text += `🔥 Uzluksiz ketma-ketlik (Streak): ${stats.currentStreak} kun (Eng uzuni: ${stats.longestStreak} kun)\n`;
  text += `✅ Muvaffaqiyatli kunlar: ${stats.successDays} kun\n`;
  text += `🏆 To'liq bajarilgan kunlar: ${stats.fullDays} kun\n\n`;
  
  if (stats.perHabit.length > 0) {
    text += `*Odatlar bo'yicha holat:*\n`;
    for (const habit of stats.perHabit) {
      text += `\n🔹 *${habit.habitName}*\n`;
      text += `   🔥 Ketma-ketlik: ${habit.currentStreak} kun\n`;
      text += `   📊 7 kun: ${Math.round(habit.periodProgress[7] || 0)}% | 14 kun: ${Math.round(habit.periodProgress[14] || 0)}% | 30 kun: ${Math.round(habit.periodProgress[30] || 0)}%\n`;
    }
  }

  return text;
}
