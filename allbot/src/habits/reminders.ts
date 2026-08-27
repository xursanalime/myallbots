import { Env } from '../types';
import { sendMessage } from '../telegram';
import { getUsersForTimeMessage, getHabitsNeedingReminder, getHabitsForLaterReminder } from './db';
import { getCurrentDate, calculateDayNumber } from './stats';

export async function runHabitScheduledChecks(env: Env): Promise<void> {
  const now = new Date();
  // UTC+5 conversion
  now.setTime(now.getTime() + 5 * 60 * 60 * 1000);
  
  const currentDate = now.toISOString().split('T')[0];
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  
  const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  if (currentHour === 7 && currentMinute === 0) {
    await sendMorningMessages(env, currentDate);
  }
  
  if (currentHour === 23 && currentMinute === 0) {
    await sendEveningMessages(env, currentDate);
  }

  await sendHabitReminders(env, timeStr, currentDate);
  await sendLaterReminders(env, currentDate);
}

async function sendMorningMessages(env: Env, currentDate: string): Promise<void> {
  const users = await getUsersForTimeMessage(env.DB);
  
  for (const user of users) {
    const dayNumber = user.start_date ? calculateDayNumber(user.start_date, currentDate) : 1;
    
    // Quick query to get count
    const { results } = await env.DB.prepare(
      `SELECT count(*) as cnt FROM habits WHERE user_id = ? AND is_active = 1`
    ).bind(user.user_id).all<{cnt: number}>();
    
    const habitCount = results && results.length > 0 ? results[0].cnt : 0;
    
    if (habitCount > 0) {
      const name = user.first_name || 'Do\'stim';
      const text = `🌅 Xayrli tong, ${name}! Bugun ${dayNumber}-kun.\n\nSizda bugun ${habitCount} ta vazifa bor.\n\n"Muvaffaqiyat - bu har kuni takrorlanadigan kichik harakatlar yig'indisi." Kichik qadamlar bilan boshlang!`;
      
      await sendMessage(env, user.user_id, text);
    }
  }
}

async function sendEveningMessages(env: Env, currentDate: string): Promise<void> {
  const users = await getUsersForTimeMessage(env.DB);
  
  for (const user of users) {
    const { results: pendingHabits } = await env.DB.prepare(
      `SELECT h.name FROM habits h 
       LEFT JOIN habit_logs hl ON h.id = hl.habit_id AND hl.date = ? 
       WHERE h.user_id = ? AND h.is_active = 1 
         AND (hl.status IS NULL OR hl.status = 'pending' OR hl.status = 'later')`
    ).bind(currentDate, user.user_id).all<{name: string}>();
    
    if (pendingHabits && pendingHabits.length > 0) {
      let text = `🌙 Kun yakunlanmoqda.\n\nBajarilmagan odatlar:\n`;
      pendingHabits.forEach(h => {
        text += `- ${h.name}\n`;
      });
      text += `\nEng kichik (minimum) versiyasini bajarish ham yetarli.`;
      
      await sendMessage(env, user.user_id, text);
    }
  }
}

async function sendHabitReminders(env: Env, currentTime: string, currentDate: string): Promise<void> {
  const habits = await getHabitsNeedingReminder(env.DB, currentTime);
  
  for (const habit of habits) {
    let text = `⏰ *${habit.name}* vaqti keldi!\n\n`;
    if (habit.if_then_plan) {
      text += `_Agar-Unda:_ ${habit.if_then_plan}\n`;
    }
    if (habit.minimum_version_text) {
      text += `_Minimum:_ ${habit.minimum_version_text}\n`;
    }
    
    const keyboard = [
      [
        { text: `✅ Bajarildi`, callback_data: `h_done:${habit.id}:${currentDate}` },
        { text: `🟡 Minimum`, callback_data: `h_min:${habit.id}:${currentDate}` }
      ],
      [
        { text: `⏭ O'tkazish`, callback_data: `h_skip:${habit.id}:${currentDate}` },
        { text: `⏰ Keyinroq`, callback_data: `h_later:${habit.id}:${currentDate}` }
      ]
    ];
    
    await sendMessage(env, habit.user_id, text, { replyMarkup: { inline_keyboard: keyboard } });
  }
}

async function sendLaterReminders(env: Env, currentDate: string): Promise<void> {
  const habits = await getHabitsForLaterReminder(env.DB, currentDate);
  
  for (const habit of habits) {
    let text = `⏰ *${habit.habit_name}* ni "Keyinroq" ga qoldirgan edingiz. Bajarish vaqti kelmadimi?\n\n`;
    
    const keyboard = [
      [
        { text: `✅ Bajarildi`, callback_data: `h_done:${habit.habit_id}:${currentDate}` },
        { text: `🟡 Minimum`, callback_data: `h_min:${habit.habit_id}:${currentDate}` }
      ],
      [
        { text: `⏭ O'tkazish`, callback_data: `h_skip:${habit.habit_id}:${currentDate}` }
      ]
    ];
    
    await sendMessage(env, habit.user_id, text, { replyMarkup: { inline_keyboard: keyboard } });
  }
}

async function checkStreakBreaks(env: Env, currentDate: string): Promise<void> {
  // Can be scheduled daily to check yesterday's breaks and send motivating messages.
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  const { results } = await env.DB.prepare(
    `SELECT user_id, streak_count, is_success_day FROM daily_scores WHERE date = ?`
  ).bind(yesterday).all<{user_id: number; streak_count: number; is_success_day: number}>();
  
  if (results) {
    for (const score of results) {
      if (score.is_success_day === 0 && score.streak_count > 0) {
        // Streak broken
        await sendMessage(env, score.user_id, "Bir kunni o'tkazib yubordingiz. Ayblamang, sababni yozib qo'ying va bugun eng kichik qadamdan qayta boshlang.");
      }
    }
  }
}
