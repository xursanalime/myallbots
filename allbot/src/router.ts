import { Env, Session, TelegramUpdate, TelegramMessage, TelegramCallbackQuery } from './types';
import { sendMessage, answerCallbackQuery, inlineKeyboard } from './telegram';
import { mainMenu, isMainMenuButton } from './menu';
import { loadSession, saveSession } from './session';
import { initSchema, registerUser, stats as vocabStats, getNotify, setNotify } from './vocab/db';
import { handleVocabMessage, handleVocabCallback, vocabWelcome } from './vocab/handlers';
import { handleHabitMessage, handleHabitCallback } from './habits/handlers';
import { handleAiMessage, handleAiCallback, showAiMenu } from './ai/handlers';
import { getHabitStats, formatStatsMessage, getCurrentDate } from './habits/stats';
import { settingsKb, settingsText } from './vocab/handlers';

function extractChatId(update: TelegramUpdate): number | null {
  const message = update.message || update.edited_message || update.channel_post;
  if (message?.chat) return message.chat.id;
  if (update.callback_query?.message) return update.callback_query.message.chat.id;
  return null;
}

export async function processUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  await initSchema(env.DB);

  const uid = extractChatId(update);
  if (uid === null) return;

  const session = await loadSession(env.DB, uid);

  try {
    if (update.callback_query) {
      await handleCallback(env, session, update.callback_query);
    } else if (update.message) {
      await handleMessage(env, session, update.message);
    }
  } finally {
    await saveSession(env.DB, uid, session);
  }
}

function esc(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text).replace(/([_*`\[])/g, '\\$1');
}

async function handleMessage(env: Env, session: Session, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const uid = chatId;
  const text = msg.text ?? '';
  const firstName = msg.from?.first_name;

  // /start — universal entry point
  if (text.startsWith('/start')) {
    session.userState = null;
    session.quizState = null;
    await registerUser(env.DB, uid, firstName || "Do'stim");

    const welcomeText =
      `\ud83d\udc4b Salom, *${esc(firstName || "Do'stim")}*!\n\n` +
      `\ud83c\udfaf *AllBot \u2014 Yagona intizom, odat va lug'at botingiz!*\n\n` +
      `\ud83d\udccb *Odatlar* \u2014 kunlik vazifalarni kuzating\n` +
      `\ud83d\udcda *Lug'at* \u2014 Leitner tizimi bilan so'z yodlang\n` +
      `\ud83e\udd16 *AI yordamchi* \u2014 shaxsiy tahlil va maslahat\n\n` +
      `\u2b07\ufe0f Quyidagi menyu orqali boshlang!`;

    await sendMessage(env, chatId, welcomeText, { replyMarkup: mainMenu() });
    return;
  }

  // 🔙 Asosiy menyu — return from any submodule
  if (text.includes('Asosiy menyu')) {
    session.userState = null;
    session.quizState = null;
    await sendMessage(env, chatId, '\ud83c\udfe0 *Asosiy menyu*', { replyMarkup: mainMenu() });
    return;
  }

  // Main menu buttons
  if (text.includes('Bugungi vazifalar') || text.includes('Yangi odat')) {
    session.quizState = null;
    if (await handleHabitMessage(env, session, msg)) return;
  }

  if (text.includes("Lug'at") || text.includes("Lug‘at") || text.includes("Lug`at")) {
    session.userState = null;
    session.quizState = null;
    await registerUser(env.DB, uid, firstName || null);
    await vocabWelcome(env, chatId, firstName || "Do'stim");
    return;
  }

  if (text.includes('Statistika')) {
    session.userState = null;
    session.quizState = null;
    await showCombinedStats(env, chatId, uid);
    return;
  }

  if (text.includes('AI yordamchi')) {
    session.userState = null;
    session.quizState = null;
    await showAiMenu(env, chatId, uid);
    return;
  }

  if (text.includes('Sozlamalar')) {
    session.userState = null;
    session.quizState = null;
    await showSettings(env, chatId, uid);
    return;
  }

  // Delegate to module handlers
  if (await handleVocabMessage(env, session, msg)) return;
  if (await handleHabitMessage(env, session, msg)) return;
  if (await handleAiMessage(env, session, msg)) return;

  // Unknown text
  await sendMessage(env, chatId, '\u2753 Menyu tugmalaridan foydalaning.', { replyMarkup: mainMenu() });
}

async function handleCallback(env: Env, session: Session, cq: TelegramCallbackQuery): Promise<void> {
  const data = cq.data ?? '';

  // Route by prefix
  if (data.startsWith('h_')) {
    if (await handleHabitCallback(env, session, cq)) return;
  }

  if (data.startsWith('ai_')) {
    if (await handleAiCallback(env, session, cq)) return;
    // Also handle settings-related AI callbacks here
    if (data === 'ai_toggle_notify') {
      const uid = cq.message?.chat.id;
      if (!uid) return;
      const current = await env.DB.prepare('SELECT notify FROM users WHERE user_id=?').bind(uid).first() as any;
      const newVal = current?.notify ? false : true;
      await setNotify(env.DB, uid, newVal);
      await answerCallbackQuery(env, cq.id, newVal ? '\ud83d\udd14 Yoqildi!' : '\ud83d\udd15 O\'chirildi!');
      return;
    }
  }

  if (data === 'settings_vocab') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    await answerCallbackQuery(env, cq.id);
    await sendMessage(env, uid, await settingsText(env, uid), {
      replyMarkup: await settingsKb(env, uid)
    });
    return;
  }

  // Everything else goes to vocab (quiz answers, settings, etc.)
  if (await handleVocabCallback(env, session, cq)) return;
}

async function showCombinedStats(env: Env, chatId: number, userId: number): Promise<void> {
  const user = await env.DB.prepare('SELECT start_date, timezone FROM users WHERE user_id=?').bind(userId).first() as any;

  let text = '\ud83d\udcca *Umumiy Statistika*\n\n';

  // Habit stats
  if (user?.start_date) {
    const habitStats = await getHabitStats(env.DB, userId, user.start_date);
    text += formatStatsMessage(habitStats);
    text += '\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
  }

  // Vocab stats
  const vs = await vocabStats(env.DB, userId);
  if (vs.total > 0) {
    const donePct = vs.total ? Math.floor(vs.done / vs.total * 100) : 0;
    text += `\ud83d\udcda *Lug'at Statistikasi*\n\n`;
    text += `\ud83d\udcda Jami so'zlar: *${vs.total}* ta\n`;
    text += `\ud83c\udd95 Yangi: *${vs.new}* ta\n`;
    text += `\ud83d\udd34 Takrorlash: *${vs.due}* ta\n`;
    text += `\ud83c\udfc6 Yakunlangan: *${vs.done}* ta\n`;
    text += `\ud83d\udcc8 Progress: *${donePct}%*`;
  } else if (!user?.start_date) {
    text = "\ud83d\udcca *Statistika*\n\nHali ma'lumot yo'q. Avval odat qo'shing yoki so'z qo'shing!";
  }

  await sendMessage(env, chatId, text, { replyMarkup: mainMenu() });
}

async function showSettings(env: Env, chatId: number, userId: number): Promise<void> {
  const user = await env.DB.prepare('SELECT notify, ai_enabled, timezone FROM users WHERE user_id=?').bind(userId).first() as any;

  const notifyStatus = (!user || user.notify) ? '\ud83d\udd14 Yoqilgan' : "\ud83d\udd15 O'chirilgan";
  const aiStatus = user?.ai_enabled ? '\u2705 Yoqilgan' : "\u274c O'chirilgan";

  const text =
    `\u2699\ufe0f *Sozlamalar*\n\n` +
    `\ud83d\udce2 Eslatmalar: ${notifyStatus}\n` +
    `\ud83e\udd16 AI yordamchi: ${aiStatus}\n` +
    `\ud83d\udd50 Vaqt mintaqasi: UTC${user?.timezone || '+05:00'}`;

  const kb = {
    inline_keyboard: [
      [
        { text: user?.notify ? "\ud83d\udd15 Eslatmalarni o'chirish" : '\ud83d\udd14 Eslatmalarni yoqish', callback_data: 'ai_toggle_notify' },
        { text: user?.ai_enabled ? "\ud83e\udd16 AI o'chirish" : '\ud83e\udd16 AI yoqish', callback_data: 'ai_toggle' }
      ],
      [
        { text: "\ud83d\udcda Lug'at sozlamalari", callback_data: 'settings_vocab' }
      ]
    ]
  };

  await sendMessage(env, chatId, text, { replyMarkup: kb });
}
