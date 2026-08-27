import { Env, Session, TelegramMessage, TelegramCallbackQuery } from '../types';
import { sendMessage, inlineKeyboard, answerCallbackQuery } from '../telegram';
import { generateFreeResponse, buildFullUserContext } from './analysis';

export async function handleAiMessage(env: Env, session: Session, msg: TelegramMessage): Promise<boolean> {
  if (session.userState !== 'ai_chat') return false;

  const chatId = msg.chat.id;
  const text = msg.text ?? '';

  if (text.includes('Ortga') || text.includes('Asosiy menyu')) {
    session.userState = null;
    await showAiMenu(env, chatId, chatId);
    return true;
  }

  await sendMessage(env, chatId, "\u23f3 O'ylanmoqdaman...");

  const userName = msg.from?.first_name || 'Foydalanuvchi';
  const userContext = await buildFullUserContext(env, chatId, userName);
  const res = await generateFreeResponse(env.OPENROUTER_API_KEY, userName, text, userContext);

  if (res) {
    await sendMessage(env, chatId, res);
  } else {
    await sendMessage(env, chatId, "\ud83e\udd16 AI hozir javob bera olmadi. Keyinroq urinib ko'ring.");
  }

  return true;
}

export async function handleAiCallback(env: Env, session: Session, cq: TelegramCallbackQuery): Promise<boolean> {
  const data = cq.data ?? '';
  if (!data.startsWith('ai_')) return false;

  const chatId = cq.message?.chat.id;
  const userId = cq.from.id;

  if (!chatId) return false;

  if (data === 'ai_toggle') {
    const user = await env.DB.prepare('SELECT ai_enabled FROM users WHERE user_id=?').bind(userId).first() as any;
    const current = user?.ai_enabled ? 1 : 0;
    await env.DB.prepare('UPDATE users SET ai_enabled=? WHERE user_id=?').bind(current ? 0 : 1, userId).run();
    await answerCallbackQuery(env, cq.id, current ? "AI o'chirildi" : 'AI yoqildi');
    await showAiMenu(env, chatId, userId);
    return true;
  }

  if (data === 'ai_toggle_notify') {
    const user = await env.DB.prepare('SELECT notify FROM users WHERE user_id=?').bind(userId).first() as any;
    const current = user?.notify !== undefined ? user.notify : 1;
    await env.DB.prepare('UPDATE users SET notify=? WHERE user_id=?').bind(current ? 0 : 1, userId).run();
    await answerCallbackQuery(env, cq.id, current ? "Eslatmalar o'chirildi" : 'Eslatmalar yoqildi');
    return true;
  }

  if (data === 'ai_chat') {
    session.userState = 'ai_chat';
    await answerCallbackQuery(env, cq.id);
    await sendMessage(env, chatId, "\ud83d\udcac Savolingizni yuboring. Men sizning odatlaringiz va lug'atingiz haqida bilaman.\n\nChiqish uchun \"\ud83d\udd19 Asosiy menyu\" ni bosing.");
    return true;
  }

  if (data === 'ai_back') {
    session.userState = null;
    await answerCallbackQuery(env, cq.id);
    return true;
  }

  return false;
}

export async function showAiMenu(env: Env, chatId: number, userId: number): Promise<void> {
  const user = await env.DB.prepare('SELECT ai_enabled FROM users WHERE user_id=?').bind(userId).first() as any;
  const isEnabled = user?.ai_enabled;

  const text =
    `\ud83e\udd16 *AI Yordamchi*\n` +
    `Holat: ${isEnabled ? '\u2705 Yoqilgan' : "\u274c O'chirilgan"}\n\n` +
    `AI yoqilganda:\n` +
    `\u2022 Kechqurungi xulosa xabariga shaxsiy sharh qo'shiladi\n` +
    `\u2022 Har haftada tahliliy hisobot keladi\n` +
    `\u2022 Savollaringizga javob olasiz`;

  const buttons = [
    [
      { text: isEnabled ? "\u274c O'chirish" : '\u2705 Yoqish', callback_data: 'ai_toggle' },
      { text: '\ud83d\udcac Savolim bor', callback_data: 'ai_chat' }
    ]
  ];

  await sendMessage(env, chatId, text, { replyMarkup: inlineKeyboard(buttons) });
}
