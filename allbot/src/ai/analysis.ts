import { Env } from '../types';
import { chatCompletion } from './openrouter';
import { stats as vocabStats, getAllWords, getBadgeCodes } from '../vocab/db';
import { xpToLevel, BADGES } from '../vocab/gamification';
import { getActiveHabits, getHabitLogsForDate } from '../habits/db';
import { getHabitStats, getCurrentDate } from '../habits/stats';

const DEFAULT_MODEL = 'google/gemini-3.7-flash';
const WEEKLY_MODEL = 'google/gemini-3.7-flash';

export async function buildFullUserContext(env: Env, userId: number, userName: string): Promise<string> {
  const today = getCurrentDate('+05:00');

  // 1. User row & Vocab info
  const user = await env.DB.prepare(
    'SELECT xp, current_streak, longest_streak, start_date, created_at FROM users WHERE user_id=?'
  ).bind(userId).first<any>();

  const xp = user?.xp ?? 0;
  const level = xpToLevel(xp);
  const streakCurrent = user?.current_streak ?? 0;
  const streakLongest = user?.longest_streak ?? 0;

  const earnedBadgeCodes = await getBadgeCodes(env.DB, userId);
  const badgesList = Array.from(earnedBadgeCodes)
    .map(code => {
      const b = BADGES[code];
      return b ? `${b[0]} ${b[1]}` : code;
    })
    .join(', ') || "Hozircha yutuqlar yo'q";

  const vStats = await vocabStats(env.DB, userId);
  const wordsList = await getAllWords(env.DB, userId);
  const wordsCount = wordsList.length;
  const recentWords = wordsList.slice(0, 25).map((w, idx) => `${idx + 1}. "${w.uz}" = "${w.eng}" (Quti ${w.box})`).join('\n') || "Hozircha so'z qo'shilmagan";

  // 2. Habits info
  const activeHabits = await getActiveHabits(env.DB, userId);
  const habitsFormatted = activeHabits.map((h, i) => {
    let desc = `${i + 1}. "${h.name}"`;
    if (h.reminder_time) desc += ` (Eslatma vaqti: ${h.reminder_time})`;
    if (h.minimum_version_text) desc += ` [Eng kam bajarish versiyasi: ${h.minimum_version_text}]`;
    if (h.if_then_plan) desc += ` [Agar-Unda rejasi: ${h.if_then_plan}]`;
    return desc;
  }).join('\n') || "Hozircha odatlar kiritilmagan";

  const todayTasks = await getHabitLogsForDate(env.DB, userId, today);
  const todayTasksFormatted = todayTasks.map(t => {
    const statusUz = t.status === 'done' ? "✅ Bajarildi" : t.status === 'minimum' ? "🟡 Minimum bajarildi" : t.status === 'skipped' ? "⏭ O'tkazildi" : "⬜ Bajarilishi kutilmoqda";
    return `- "${t.name}": ${statusUz}`;
  }).join('\n') || "Bugun uchun vazifalar hali belgilanmagan";

  let habitStatsText = "Odatlar statistikasi hali shakllanmagan (boshlash sanasi yo'q).";
  if (user?.start_date) {
    const hs = await getHabitStats(env.DB, userId, user.start_date);
    habitStatsText = `Umumiy intizom balli: ${hs.overallScore.toFixed(1)}%, Muvaffaqiyatli kunlar: ${hs.successDays} kun, To'liq bajarilgan kunlar: ${hs.fullDays} kun, Joriy uzluksizlik (streak): ${hs.currentStreak} kun, Rekord streak: ${hs.longestStreak} kun.`;
  }

  // 3. Recent 7 days daily scores
  const { results: recentScores } = await env.DB.prepare(
    `SELECT date, total_score, is_success_day, is_full_day, streak_count FROM daily_scores WHERE user_id = ? ORDER BY date DESC LIMIT 7`
  ).bind(userId).all<any>();
  const scoresFormatted = (recentScores && recentScores.length > 0)
    ? recentScores.map(s => `• Sana ${s.date}: ball = ${s.total_score}, muvaffaqiyatli = ${s.is_success_day ? 'Ha' : 'Yo\'q'}, streak = ${s.streak_count} kun`).join('\n')
    : "So'nggi kunlar kundaligi bo'sh.";

  return `
FOYDALANUVCHINING ANIQ VA REAL PROFILI:
- Ismi: ${userName} (Telegram ID: ${userId})
- Bugungi sana: ${today} (O'zbekiston / Toshkent vaqti, UTC+5)

1. 📚 LUG'AT (LEITNER BRAINBRIDGE) BO'LIMI:
- Bazadagi jami so'zlar soni: ${wordsCount} ta
- Shundan yangi so'zlar: ${vStats.new} ta
- Bugun takrorlanishi kerak bo'lgan so'zlar (Due): ${vStats.due} ta
- To'liq yodlangan / Yakunlangan (Quti 5): ${vStats.done} ta
- Qutilardagi taqsimot:
  • Quti 1 (boshlang'ich): ${vStats.boxes[1] ?? 0} ta
  • Quti 2: ${vStats.boxes[2] ?? 0} ta
  • Quti 3: ${vStats.boxes[3] ?? 0} ta
  • Quti 4: ${vStats.boxes[4] ?? 0} ta
  • Quti 5 (yodlangan): ${vStats.boxes[5] ?? 0} ta
- To'plangan tajriba (XP): ${xp} XP (Daraja: ${level}-daraja)
- Lug'at takrorlash uzluksizligi (Streak): ${streakCurrent} kun (Maksimal rekord: ${streakLongest} kun)
- Qo'lga kiritilgan yutuq nishonlari: ${badgesList}
- So'nggi qo'shilgan so'zlar ro'yxati (namuna):
${recentWords}

2. 📋 ODATLAR VA KUNLIK INTIZOM (HABITS) BO'LIMI:
- Foydalanuvchining faol odatlari:
${habitsFormatted}
- Bugungi kun (${today}) vazifalari holati:
${todayTasksFormatted}
- Odatlar bo'yicha umumiy statistika:
${habitStatsText}
- Oxirgi kunlar kundaligi:
${scoresFormatted}
`;
}

export async function generateDailyAnalysis(
  apiKey: string,
  userName: string,
  userContextText: string
): Promise<string | null> {
  const systemPrompt = `Sen o'zbek tilidagi shaxsiy intizom va odat tahlilchisisan.
Foydalanuvchining kunlik ma'lumotlari asosida 2-3 gaplik qisqa, shaxsiy, iliq sharh yoz.
Faqat real ma'lumotlarga asoslan, o'ylab topma. Ohang: samimiy, qo'llab-quvvatlovchi, bosim qilmaydigan.

${userContextText}`;

  return chatCompletion(apiKey, DEFAULT_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Bugungi kunim bo'yicha qisqa tahlil va xulosa ber.` }
  ], 350);
}

export async function generateWeeklyReport(
  apiKey: string,
  userName: string,
  userContextText: string
): Promise<string | null> {
  const systemPrompt = `Sen intizom, odat va lug'at bo'yicha haftalik tahlil yozuvchisisan.
Foydalanuvchining ma'lumotlari asosida:
1) Nima yaxshi ishladi (yutuqlar)
2) Nima to'siq bo'ldi
3) Keyingi haftaga bitta aniq, foydali tavsiya ber.
O'zbek tilida, 4-6 gapdan oshmasin.

${userContextText}`;

  return chatCompletion(apiKey, WEEKLY_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Mening haftalik hisoboti va tahlilimni tuzib ber.` }
  ], 500);
}

export async function generateFreeResponse(
  apiKey: string,
  userName: string,
  question: string,
  userContextText: string
): Promise<string | null> {
  const systemPrompt = `Sen "AllBot" (intizom, odat va Leitner lug'at boti)ning shaxsiy sun'iy intellekt yordamchisisan.
Foydalanuvchi: ${userName}.

Senga foydalanuvchining bazasidan olingan TO'LIQ VA REAL MA'LUMOTLAR taqdim etildi.

O'TA MUHIM QOIDALAR:
1. Foydalanuvchi o'z statistikasi, so'zlari, qancha so'zi borligi, odatlari, streaklari, XP ballari haqida so'raganda, AYNAN quyidagi fakt va aniq raqamlarga asoslanib javob ber!
2. Hech qachon "menda ma'lumot yo'q", "yozuvlar saqlanmagan" dema! Chunki barcha ma'lumotlar quyida keltirilgan.
3. Agar so'zlari ro'yxatini so'rasa, bazasidagi so'zlardan misollar keltirib aytib ber.
4. Javoblaringni o'zbek tilida, samimiy, yordam berishga tayyor va lo'nda ohangda yoz.
5. Telegram xabarlariga mos qilib, emojilar va formatlashdan chiroyli foydalan.

${userContextText}`;

  return chatCompletion(apiKey, DEFAULT_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ], 800);
}
