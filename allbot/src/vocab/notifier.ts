import { Env } from '../types';
import { sendMessage } from '../telegram';
import { 
  setNotify, usersToNotify, getStreak, markNotified, 
  usersStreakAtRisk, markStreakWarned, usersForReengagement, 
  markReengaged, usersForWeeklySummary, markWeeklySummarySent,
  stats, getXp, countWordsSince
} from './db';
import { levelProgress } from './gamification';

export const COOLDOWN_HOURS = 4;
export const STREAK_WARNING_HOUR = 20;
export const REENGAGE_INACTIVE_DAYS = 3;
export const REENGAGE_COOLDOWN_DAYS = 3;

export async function send(env: Env, uid: number, text: string): Promise<boolean> {
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

export async function notifyOnce(env: Env): Promise<void> {
  const targets = await usersToNotify(env.DB, COOLDOWN_HOURS);
  for (const { user_id, first_name, due_count } of targets) {
    const name = first_name || "Do'stim";
    const streak = (await getStreak(env.DB, user_id)).current;
    const streakLine = streak > 0 ? `\n\u{1F525} Streak'ingiz: *${streak} kun* \u2014 uzilib qolmasin!\n` : "";
    const text = `\u{1F514} *Eslatma, ${name}!*\n\n\u{1F4DA} Takrorlash vaqti keldi: *${due_count} ta* so'z tayyor.\n${streakLine}\u{1F4A1} *\u{1F501} Takrorlash* tugmasini bosib mashq qiling!`;
    if (await send(env, user_id, text)) await markNotified(env.DB, user_id);
  }
}

export async function checkStreakRisk(env: Env): Promise<void> {
  const tashkentHour = (new Date().getUTCHours() + 5) % 24;
  if (tashkentHour < STREAK_WARNING_HOUR) return;
  const targets = await usersStreakAtRisk(env.DB);
  for (const { user_id, first_name, current_streak } of targets) {
    const name = first_name || "Do'stim";
    const text = `\u{1F525} *Diqqat, ${name}!*\n\nSizning *${current_streak} kunlik* streak'ingiz bugun uzilib qolishi mumkin!\n\n\u{1F4A1} Bir nechta so'zni takrorlab, uni saqlab qoling.`;
    if (await send(env, user_id, text)) await markStreakWarned(env.DB, user_id);
  }
}

export async function checkReengagement(env: Env): Promise<void> {
  const tashkentHour = (new Date().getUTCHours() + 5) % 24;
  if (tashkentHour < 10 || tashkentHour >= 20) return;

  const targets = await usersForReengagement(env.DB, REENGAGE_INACTIVE_DAYS, REENGAGE_COOLDOWN_DAYS);
  for (const { user_id, first_name, days_inactive } of targets) {
    if (!days_inactive || days_inactive < REENGAGE_INACTIVE_DAYS || days_inactive > 365) continue;
    const name = first_name || "Do'stim";
    const text = `\u{1F44B} *Sizni sog'indik, ${name}!*\n\n*${days_inactive} kundan* beri so'zlaringizni takrorlamadingiz.\n\n\u{1F4A1} *\u{1F501} Takrorlash* tugmasini bosib, o'rganishni davom eting!`;
    if (await send(env, user_id, text)) await markReengaged(env.DB, user_id);
  }
}

export async function checkWeeklySummary(env: Env): Promise<void> {
  const now = new Date();
  const tashkentTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const dayOfWeek = tashkentTime.getUTCDay(); // 0 = Yakshanba, 1 = Dushanba
  
  // Haftalik xulosa FAQAT Dushanba kunlari yuboriladi
  if (dayOfWeek !== 1) return;

  // Dushanba kuni ertalab 09:00 dan 13:00 gacha
  const currentHour = tashkentTime.getUTCHours();
  if (currentHour < 9 || currentHour >= 13) return;

  const targets = await usersForWeeklySummary(env.DB);
  for (const { user_id, first_name } of targets) {
    const name = first_name || "Do'stim";
    const s = await stats(env.DB, user_id);
    const xp = await getXp(env.DB, user_id);
    const [level] = levelProgress(xp);
    const streak = await getStreak(env.DB, user_id);
    const newThisWeek = await countWordsSince(env.DB, user_id, 7);
    const text = `\u{1F4C5} *Haftalik xulosa, ${name}!*\n\n\u{1F4DA} Jami so'zlar: *${s.total} ta* (shu hafta +*${newThisWeek}* ta)\n\u2B50 XP: *${xp}*   \u{1F4C8} Daraja: *${level}*\n\u{1F525} Joriy streak: *${streak.current} kun*   \u{1F3C5} Rekord: *${streak.longest} kun*\n\n\u{1F4AA} Davom eting!`;
    if (await send(env, user_id, text)) await markWeeklySummarySent(env.DB, user_id);
  }
}

export async function runScheduledChecks(env: Env): Promise<void> {
  await notifyOnce(env);
  await checkStreakRisk(env);
  await checkReengagement(env);
  await checkWeeklySummary(env);
}
