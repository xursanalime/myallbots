import { Env } from '../types';
import { sendMessage } from '../telegram';
import { 
  getUsersForTimeMessage, 
  getHabitsNeedingReminder, 
  getHabitsForLaterReminder,
  markHabitReminded,
  markMorningMessageSent,
  markEveningMessageSent
} from './db';
import { calculateDayNumber } from './stats';
import { generateDailyAnalysis, buildFullUserContext } from '../ai/analysis';

export async function runHabitScheduledChecks(env: Env): Promise<void> {
  const now = new Date();
  // UTC+5 conversion for Tashkent
  const tashkentTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  
  const currentDate = tashkentTime.toISOString().split('T')[0];
  const currentHour = tashkentTime.getUTCHours();
  const currentMinute = tashkentTime.getUTCMinutes();
  
  const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  // Morning message window: 07:00 - 11:00 AM Toshkent time
  if (currentHour >= 7 && currentHour < 11) {
    await sendMorningMessages(env, currentDate);
  }
  
  // Evening message window: after 21:30 (9:30 PM) Toshkent time
  if (currentHour >= 22 || (currentHour === 21 && currentMinute >= 30)) {
    await sendEveningMessages(env, currentDate);
  }

  // Check individual habit reminders
  await sendHabitReminders(env, timeStr, currentDate);
  
  // Check 'later' reminders
  await sendLaterReminders(env, currentDate);
}

async function sendMorningMessages(env: Env, currentDate: string): Promise<void> {
  const users = await getUsersForTimeMessage(env.DB);
  
  for (const user of users) {
    // Only send once per day
    if (user.last_morning_date === currentDate) continue;

    const dayNumber = user.start_date ? calculateDayNumber(user.start_date, currentDate) : 1;
    
    // Check habits count
    const { results: hRes } = await env.DB.prepare(
      `SELECT count(*) as cnt FROM habits WHERE user_id = ? AND active = 1`
    ).bind(user.user_id).all<{cnt: number}>();
    const habitCount = hRes && hRes.length > 0 ? hRes[0].cnt : 0;

    // Check due words count
    const { results: wRes } = await env.DB.prepare(
      `SELECT count(*) as cnt FROM words WHERE user_id = ? AND box > 0 AND next_review <= CURRENT_TIMESTAMP`
    ).bind(user.user_id).all<{cnt: number}>();
    const dueWordsCount = wRes && wRes.length > 0 ? wRes[0].cnt : 0;

    // If user has any habits or due words, or just uses the bot
    const name = user.first_name || "Do'stim";
    let text = `🌅 *Xayrli tong, ${name}!* Bugun ${dayNumber}-kun.\n\n`;

    if (habitCount > 0) {
      text += `📋 Sizda bugun *${habitCount} ta* odat vazifasi bor.\n`;
    }
    if (dueWordsCount > 0) {
      text += `📚 Takrorlash uchun *${dueWordsCount} ta* so'z tayyor.\n`;
    }
    if (habitCount === 0 && dueWordsCount === 0) {
      text += `Bugungi kuningiz unumli va maroqli o'tsin!\n`;
    }

    text += `\n_"Muvaffaqiyat — bu har kuni takrorlanadigan kichik harakatlar yig'indisi." Kichik qadamlar bilan boshlang!_`;
    
    await sendMessage(env, user.user_id, text);
    await markMorningMessageSent(env.DB, user.user_id, currentDate);
  }
}

async function sendEveningMessages(env: Env, currentDate: string): Promise<void> {
  const users = await getUsersForTimeMessage(env.DB);
  
  for (const user of users) {
    // Only send once per day
    if (user.last_evening_date === currentDate) continue;

    const { results: pendingHabits } = await env.DB.prepare(
      `SELECT h.name FROM habits h 
       LEFT JOIN habit_logs hl ON h.id = hl.habit_id AND hl.date = ? 
       WHERE h.user_id = ? AND h.active = 1 
         AND (hl.status IS NULL OR hl.status = 'pending' OR hl.status = 'later')`
    ).bind(currentDate, user.user_id).all<{name: string}>();
    
    let text = `🌙 *Kun yakunlanmoqda.*\n\n`;
    if (pendingHabits && pendingHabits.length > 0) {
      text += `Bajarilmagan odatlar:\n`;
      pendingHabits.forEach(h => {
        text += `  • ${h.name}\n`;
      });
      text += `\n_Eng kichik (minimum) versiyasini bajarish ham yetarli._\n\n`;
    } else {
      text += `Bugungi barcha vazifalarni a'lo darajada bajarganingiz bilan tabriklayman! 🎉\n\n`;
    }

    // If AI is enabled, append personal AI daily analysis
    if (user.ai_enabled) {
      try {
        const userContext = await buildFullUserContext(env, user.user_id, user.first_name || 'Do\'stim');
        const aiComment = await generateDailyAnalysis(env.OPENROUTER_API_KEY, user.first_name || 'Do\'stim', userContext);
        if (aiComment) {
          text += `🤖 *AI Yordamchi sharhi:*\n${aiComment}\n`;
        }
      } catch (err) {
        console.error('Evening AI comment error:', err);
      }
    }
    
    await sendMessage(env, user.user_id, text);
    await markEveningMessageSent(env.DB, user.user_id, currentDate);
  }
}

async function sendHabitReminders(env: Env, currentTime: string, currentDate: string): Promise<void> {
  const habits = await getHabitsNeedingReminder(env.DB, currentTime, currentDate);
  
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
    await markHabitReminded(env.DB, habit.id, currentDate);
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
