import { Env, Session, TelegramUpdate, TelegramMessage, TelegramCallbackQuery } from './types';
import { sendMessage, editMessageText, answerCallbackQuery, inlineKeyboard } from './telegram';
import { mainMenu, isMainMenuButton } from './menu';
import { loadSession, saveSession } from './session';
import { initSchema, registerUser, stats as vocabStats, getNotify, setNotify } from './vocab/db';
import { handleVocabMessage, handleVocabCallback, vocabWelcome } from './vocab/handlers';
import { handleHabitMessage, handleHabitCallback } from './habits/handlers';
import { handleAiMessage, handleAiCallback, showAiMenu } from './ai/handlers';
import { getHabitStats, formatStatsMessage, getCurrentDate } from './habits/stats';
import { setChannelId, setChannelReportEnabled } from './habits/db';
import { sendChannelReport } from './habits/channel_report';
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

  // 📢 Forward from channel detection (auto-connect channel)
  if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') {
    const channelId = String(msg.forward_from_chat.id);
    const channelTitle = msg.forward_from_chat.title || 'Kanal';
    const channelUsername = msg.forward_from_chat.username ? `@${msg.forward_from_chat.username}` : '';

    await setChannelId(env.DB, uid, channelId);
    session.userState = null;

    let text = `🎉 *Kanal muvaffaqiyatli ulandi!*\n\n`;
    text += `📢 *Kanal:* ${esc(channelTitle)}\n`;
    if (channelUsername) text += `🔗 *Username:* ${channelUsername}\n`;
    text += `🆔 *ID:* \`${channelId}\`\n\n`;
    text += `⏰ Har kuni soat *22:00 da* (Toshkent vaqti) kunlik hisobotingiz ushbu kanalga yuboriladi.\n\n`;
    text += `💡 *Muhim:* Bot kanalingizda *Administrator* (xabar yozish ruxsati bilan) ekanligiga ishonch hosil qiling!\n\n`;
    text += `👉 Hoziroq kanalga test hisoboti yuborish uchun /testreport ni bosing.`;

    await sendMessage(env, chatId, text, { replyMarkup: mainMenu() });
    return;
  }

  // 📢 Channel commands
  if (text === '/testreport' || text.startsWith('/testreport ')) {
    const today = getCurrentDate('+05:00');
    await sendMessage(env, chatId, `⏳ Kanalga test hisoboti yuborilmoqda...`);
    const res = await sendChannelReport(env, uid, today);
    if (res.success) {
      await sendMessage(env, chatId, `✅ *Hisobot kanalingizga muvaffaqiyatli yuborildi!*\n\nKanalingizni tekshirib ko'rishingiz mumkin.`, { replyMarkup: mainMenu() });
    } else {
      await sendMessage(env, chatId, `❌ *Xatolik yuz berdi:*\n\n${res.error || 'Noma\'lum xatolik'}\n\nIltimos, bot kanalda Administrator ekanligini va xabar yozish ruxsati borligini tekshiring.`);
    }
    return;
  }

  if (text.startsWith('/setchannel')) {
    const parts = text.split(/\s+/);
    const target = parts[1];
    if (!target) {
      session.userState = 'setting_channel';
      await sendMessage(env, chatId, `📢 *Kanalni ulash*\n\nKanal ID yoki @username kiriting (masalan: \`-100123456789\` yoki \`@mydev_channel\`):\n\n_Yoki kanalingizdan istalgan xabarni bu yerga Forward qiling!_`);
      return;
    }
    await setChannelId(env.DB, uid, target);
    session.userState = null;
    await sendMessage(env, chatId, `✅ Kanal ulandi: \`${target}\`\n\nHar kuni 22:00 da kunlik hisobot yuboriladi.\nTest qilish uchun: /testreport`, { replyMarkup: mainMenu() });
    return;
  }

  if (text === '/delchannel' || text === '/unsetchannel') {
    await setChannelId(env.DB, uid, null);
    await sendMessage(env, chatId, `✅ Kanal uzildi. Endi hisobotlar kanalga yuborilmaydi.`);
    return;
  }

  // 📢 Setting channel state (manual entry)
  if (session.userState === 'setting_channel') {
    if (text.includes('Asosiy menyu') || text.includes('Orqaga')) {
      session.userState = null;
      await sendMessage(env, chatId, 'Bekor qilindi.', { replyMarkup: mainMenu() });
      return;
    }
    const clean = text.trim();
    if (clean.startsWith('@') || clean.startsWith('-100') || /^-?\d+$/.test(clean)) {
      await setChannelId(env.DB, uid, clean);
      session.userState = null;
      await sendMessage(env, chatId, `✅ Kanal muvaffaqiyatli saqlandi: \`${clean}\`\n\nHar kuni 22:00 da kunlik hisobot yuboriladi.\nTest qilish uchun /testreport ni bosing!`, { replyMarkup: mainMenu() });
      return;
    } else {
      await sendMessage(env, chatId, `⚠️ Noto'g'ri format. Kanal ID (masalan: \`-10023456789\`) yoki @username (masalan: \`@mydev_channel\`) kiriting.\n\nYoki kanaldan biron xabarni bu yerga Forward qiling.`);
      return;
    }
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

  if (data === 'settings_channel') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    await answerCallbackQuery(env, cq.id);
    await showChannelSettings(env, uid, uid, cq.message?.message_id);
    return;
  }

  if (data === 'settings_main') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    await answerCallbackQuery(env, cq.id);
    await showSettings(env, uid, uid, cq.message?.message_id);
    return;
  }

  if (data === 'channel_enter_id') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    session.userState = 'setting_channel';
    await answerCallbackQuery(env, cq.id);
    await sendMessage(env, uid, `✏️ Kanal ID yoki @username kiriting:\nMasalan: \`-100123456789\` yoki \`@mydev_channel\`\n\n_Yoki kanalingizdan istalgan xabarni bu yerga Forward qiling!_`);
    return;
  }

  if (data === 'channel_test') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    await answerCallbackQuery(env, cq.id, '⏳ Test hisoboti yuborilmoqda...');
    const today = getCurrentDate('+05:00');
    const res = await sendChannelReport(env, uid, today);
    if (res.success) {
      await sendMessage(env, uid, '✅ Test hisoboti kanalingizga muvaffaqiyatli yuborildi!\nKanalingizni tekshirib ko\'ring.');
    } else {
      await sendMessage(env, uid, `❌ *Xatolik yuz berdi:*\n\n${res.error}\n\nBot kanalingizda Administrator (xabar yozish huquqi bilan) ekanligini tekshiring.`);
    }
    return;
  }

  if (data === 'channel_toggle') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    const user = await env.DB.prepare('SELECT channel_report_enabled FROM users WHERE user_id=?').bind(uid).first() as any;
    const current = user?.channel_report_enabled !== 0;
    const nextVal = !current;
    await setChannelReportEnabled(env.DB, uid, nextVal);
    await answerCallbackQuery(env, cq.id, nextVal ? '▶️ Hisobot yoqildi!' : '⏸ Hisobot to\'xtatildi!');
    await showChannelSettings(env, uid, uid, cq.message?.message_id);
    return;
  }

  if (data === 'channel_unlink') {
    const uid = cq.message?.chat.id;
    if (!uid) return;
    await setChannelId(env.DB, uid, null);
    await answerCallbackQuery(env, cq.id, 'Kanal uzildi');
    await showChannelSettings(env, uid, uid, cq.message?.message_id);
    return;
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

  let text = '📊 *Umumiy Statistika*\n\n';

  // Habit stats
  if (user?.start_date) {
    const habitStats = await getHabitStats(env.DB, userId, user.start_date);
    text += formatStatsMessage(habitStats);
    text += '\n\n━━━━━━━━━━━━━━━━━━━━━\n\n';
  }

  // Vocab stats
  const vs = await vocabStats(env.DB, userId);
  if (vs.total > 0) {
    const donePct = vs.total ? Math.floor(vs.done / vs.total * 100) : 0;
    text += `📚 *Lug'at Statistikasi*\n\n`;
    text += `📚 Jami so'zlar: *${vs.total}* ta\n`;
    text += `🆕 Yangi: *${vs.new}* ta\n`;
    text += `🔴 Takrorlash: *${vs.due}* ta\n`;
    text += `🏆 Yakunlangan: *${vs.done}* ta\n`;
    text += `📈 Progress: *${donePct}%*`;
  } else if (!user?.start_date) {
    text = "📊 *Statistika*\n\nHali ma'lumot yo'q. Avval odat qo'shing yoki so'z qo'shing!";
  }

  await sendMessage(env, chatId, text, { replyMarkup: mainMenu() });
}

async function showSettings(env: Env, chatId: number, userId: number, messageId?: number): Promise<void> {
  const user = await env.DB.prepare('SELECT notify, ai_enabled, timezone, channel_id, channel_report_enabled FROM users WHERE user_id=?').bind(userId).first() as any;

  const notifyStatus = (!user || user.notify) ? '🔔 Yoqilgan' : "🔕 O'chirilgan";
  const aiStatus = user?.ai_enabled ? '✅ Yoqilgan' : "❌ O'chirilgan";
  const channelStatus = user?.channel_id
    ? `${user.channel_report_enabled !== 0 ? '✅ Yoqilgan' : '⏸ To\'xtatilgan'} (\`${user.channel_id}\`)`
    : "❌ Ulanmagan";

  const text =
    `⚙️ *Sozlamalar*\n\n` +
    `📢 Eslatmalar: ${notifyStatus}\n` +
    `🤖 AI yordamchi: ${aiStatus}\n` +
    `📡 Hisobot kanali (22:00): ${channelStatus}\n` +
    `🕒 Vaqt mintaqasi: UTC${user?.timezone || '+05:00'}`;

  const kb = {
    inline_keyboard: [
      [
        { text: user?.notify ? "🔕 Eslatmalarni o'chirish" : '🔔 Eslatmalarni yoqish', callback_data: 'ai_toggle_notify' },
        { text: user?.ai_enabled ? "🤖 AI o'chirish" : '🤖 AI yoqish', callback_data: 'ai_toggle' }
      ],
      [
        { text: "📡 Hisobot kanali sozlamalari", callback_data: 'settings_channel' }
      ],
      [
        { text: "📚 Lug'at sozlamalari", callback_data: 'settings_vocab' }
      ]
    ]
  };

  if (messageId) {
    await editMessageText(env, chatId, messageId, text, { replyMarkup: kb });
  } else {
    await sendMessage(env, chatId, text, { replyMarkup: kb });
  }
}

async function showChannelSettings(env: Env, chatId: number, userId: number, messageId?: number): Promise<void> {
  const user = await env.DB.prepare('SELECT channel_id, channel_report_enabled FROM users WHERE user_id=?').bind(userId).first() as any;

  const hasChannel = Boolean(user?.channel_id);
  const isEnabled = user?.channel_report_enabled !== 0;

  let text = `📢 *Kunlik hisobot kanali (22:00)*\n\n`;
  if (hasChannel) {
    text += `🔹 Ulangan kanal: \`${user.channel_id}\`\n`;
    text += `🔹 Holati: ${isEnabled ? '✅ Faol (har kuni 22:00 da yuboriladi)' : '⏸ To\'xtatilgan'}\n\n`;
    text += `_Kanalga hoziroq sinov hisobotini yuborish uchun pastdagi tugmani bosing:_`;
  } else {
    text += `Hozircha hech qanday kanal ulanmagan.\n\n`;
    text += `*Kanalni qanday ulash mumkin?*\n`;
    text += `1️⃣ Botni (@Cloudchibot) kanalingizga qo'shing va **Administrator** qiling (xabar yozish ruxsatini bering).\n`;
    text += `2️⃣ Kanaldan istalgan xabarni botga **Forward** qiling (bot kanalni avtomatik taniydi).\n`;
    text += `3️⃣ Yoki pastdagi tugma orqali kanal ID / @username kiriting.`;
  }

  const buttons: any[] = [];
  if (hasChannel) {
    buttons.push([
      { text: '🚀 Test hisobot yuborish', callback_data: 'channel_test' }
    ]);
    buttons.push([
      { text: isEnabled ? '⏸ Hisobotni to\'xtatish' : '▶️ Hisobotni yoqish', callback_data: 'channel_toggle' },
      { text: '❌ Kanalni uzish', callback_data: 'channel_unlink' }
    ]);
  } else {
    buttons.push([
      { text: '✏️ ID yoki @username kiritish', callback_data: 'channel_enter_id' }
    ]);
  }
  buttons.push([
    { text: '🔙 Orqaga (Sozlamalar)', callback_data: 'settings_main' }
  ]);

  const kb = { inline_keyboard: buttons };
  if (messageId) {
    await editMessageText(env, chatId, messageId, text, { replyMarkup: kb });
  } else {
    await sendMessage(env, chatId, text, { replyMarkup: kb });
  }
}
