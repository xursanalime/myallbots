import { Env } from '../types';
import { sendMessage } from '../telegram';
import { getHabitLogsForDate, calculateAndSaveDailyScore } from './db';
import { calculateDayNumber, getHabitStats } from './stats';
import { stats as getVocabStats, getXp } from '../vocab/db';
import { xpToLevel } from '../vocab/gamification';
import { chatCompletion } from '../ai/openrouter';

const DEFAULT_MODEL = 'google/gemini-3.7-flash';

export async function generateChannelReportText(
  env: Env,
  userId: number,
  userName: string,
  date: string,
  startDate?: string | null
): Promise<string> {
  const dayNumber = startDate ? calculateDayNumber(startDate, date) : 1;
  const [year, month, day] = date.split('-');
  const displayDate = `${day}.${month}.${year}`;

  // 1. Habits data
  const habitLogs = await getHabitLogsForDate(env.DB, userId, date);
  const totalHabits = habitLogs.length;

  let doneCount = 0;
  let minCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;

  const habitLines: string[] = [];
  for (const h of habitLogs) {
    if (h.status === 'done') {
      doneCount++;
      habitLines.push(`✅ *${h.name}*`);
    } else if (h.status === 'minimum') {
      minCount++;
      const minText = h.minimum_version_text ? ` (${h.minimum_version_text})` : ' (minimum)';
      habitLines.push(`🟡 *${h.name}*${minText}`);
    } else if (h.status === 'skipped') {
      skippedCount++;
      const noteText = h.log_note ? ` — _${h.log_note}_` : '';
      habitLines.push(`⏭ *${h.name}* (o'tkazildi)${noteText}`);
    } else {
      pendingCount++;
      habitLines.push(`⬜ *${h.name}* (bajarilmadi)`);
    }
  }

  // 2. Daily score & streak
  const dailyScore = await calculateAndSaveDailyScore(env.DB, userId, date);
  let streak = dailyScore.streak_count || 0;
  let overallScorePct = totalHabits > 0 ? Math.round((dailyScore.total_score / totalHabits) * 100) : 0;

  if (startDate) {
    const statsResult = await getHabitStats(env.DB, userId, startDate);
    streak = statsResult.currentStreak;
  }

  // 3. Vocab stats
  const vStats = await getVocabStats(env.DB, userId);
  const xp = await getXp(env.DB, userId);
  const level = xpToLevel(xp);

  // 4. AI summary (Gemini 3.7 Flash)
  let aiComment = '';
  if (env.OPENROUTER_API_KEY) {
    try {
      const summaryContext = `
Foydalanuvchi: ${userName}
Sana: ${displayDate} (${dayNumber}-kun)
Odatlar holati (${doneCount + minCount}/${totalHabits} bajarildi):
${habitLines.join('\n')}
Kunlik ball: ${overallScorePct}%
Streak: ${streak} kun
Lug'at: ${vStats.total} ta so'z (Quti 5: ${vStats.done} ta), ${xp} XP (${level}-daraja)
`;
      const systemPrompt = `Sen shaxsiy rivojlanish ("My development") kanali uchun kunlik qisqa xulosa yozuvchisan.
Keltirilgan ma'lumotlar asosida 2-3 jumlali lo'nda, samimiy, intizomni mustahkamlovchi xulosa yoki motivatsion tavsiya yoz.
O'zbek tilida yoz. Hech qanday soxta gaplarsiz, bugungi faktlarga asoslan.`;

      const res = await chatCompletion(
        env.OPENROUTER_API_KEY,
        DEFAULT_MODEL,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: summaryContext }
        ],
        250
      );
      if (res) {
        aiComment = res.trim();
      }
    } catch (e) {
      console.error('AI channel report comment error:', e);
    }
  }

  // 5. Assemble final message
  let text = `📊 *KUNLIK HISOBOT | ${displayDate}*\n`;
  text += `🎯 *${dayNumber}-kun*\n\n`;

  if (totalHabits > 0) {
    text += `📋 *ODATLAR VA INTIZOM:*\n`;
    text += `${habitLines.join('\n')}\n\n`;

    text += `📈 *Kunlik natija:*\n`;
    text += `• Intizom ko'rsatkichi: *${overallScorePct}%*\n`;
    text += `• Bajarilgan odatlar: *${doneCount + minCount}/${totalHabits} ta*\n`;
    text += `• Uzluksiz ketma-ketlik (Streak): *${streak} kun* 🔥\n\n`;
  } else {
    text += `📋 *ODATLAR:* Hozircha faol odatlar kiritilmagan.\n\n`;
  }

  if (vStats.total > 0) {
    text += `📚 *LUG'AT (BrainBridge):*\n`;
    text += `• Jami so'zlar: *${vStats.total} ta*\n`;
    text += `• To'liq o'zlashtirilgan: *${vStats.done} ta* (Quti 5)\n`;
    text += `• Tajriba: *${xp} XP* (${level}-daraja)\n\n`;
  }

  if (aiComment) {
    text += `🤖 *Kun xulosasi (AI):*\n`;
    text += `"${aiComment}"\n\n`;
  }

  text += `#kunlik_hisobot #intizom #development #natija`;

  return text;
}

export async function sendChannelReport(
  env: Env,
  userId: number,
  date: string,
  targetChannelId?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await env.DB.prepare(
    'SELECT first_name, channel_id, start_date FROM users WHERE user_id = ?'
  ).bind(userId).first<any>();

  const channelId = targetChannelId || user?.channel_id || env.CHANNEL_ID;
  if (!channelId) {
    return { success: false, error: "Kanal ulanmagan. Avval kanalni botga ulang!" };
  }

  const userName = user?.first_name || "Do'stim";
  const reportText = await generateChannelReportText(
    env,
    userId,
    userName,
    date,
    user?.start_date
  );

  const res = await sendMessage(env, channelId as any, reportText);

  if (res && res.ok === false) {
    const desc = res.description || "Telegram API xatoligi";
    return {
      success: false,
      error: `Kanalga yuborishda xatolik yuz berdi: ${desc}. Bot kanalga Administrator qilib qo'shilganini va xabar yozish ruxsati borligini tekshiring!`
    };
  }

  return { success: true };
}
