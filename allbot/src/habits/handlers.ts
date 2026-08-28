import { Env, TelegramMessage, TelegramCallbackQuery } from '../types';
import { sendMessage, editMessageText, answerCallbackQuery } from '../telegram';
import { getHabitLogsForDate, createHabit, deactivateHabit, logHabit, calculateAndSaveDailyScore, getActiveHabits } from './db';
import { getCurrentDate, getHabitStats, formatStatsMessage } from './stats';

type Session = any; // Assuming Session is defined globally or passed as any for now

export async function handleHabitMessage(env: Env, session: Session, msg: TelegramMessage): Promise<boolean> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return false;
  const text = msg.text || '';

  if (text.includes('Bugungi vazifalar')) {
    await showTodayTasks(env, chatId, userId);
    return true;
  }

  if (text.includes('Yangi odat')) {
    await startHabitCreation(env, session, chatId);
    return true;
  }
  
  if (text.includes('Statistika')) {
    const user = await env.DB.prepare('SELECT start_date FROM users WHERE user_id = ?').bind(userId).first<{start_date: string}>();
    if (user && user.start_date) {
      const stats = await getHabitStats(env.DB, userId, user.start_date);
      await sendMessage(env, chatId, formatStatsMessage(stats));
    }
    return true;
  }

  // Handle User States encoded as objects
  const state = session.userState;
  if (state && typeof state === 'object') {
    if (state.mode === 'habit_name') {
      await handleHabitNameInput(env, session, chatId, userId, text);
      return true;
    }
    if (state.mode === 'habit_time') {
      await handleHabitTimeInput(env, session, chatId, text);
      return true;
    }
    if (state.mode === 'habit_minimum') {
      await handleHabitMinimumInput(env, session, chatId, text);
      return true;
    }
    if (state.mode === 'habit_ifthen') {
      await handleHabitIfThenInput(env, session, chatId, userId, text);
      return true;
    }
  }

  return false;
}

export async function handleHabitCallback(env: Env, session: Session, cq: TelegramCallbackQuery): Promise<boolean> {
  if (!cq.data || !cq.data.startsWith('h_')) return false;

  const chatId = cq.message?.chat.id;
  const userId = cq.from.id;
  if (!chatId) return false;

  const parts = cq.data.split(':');
  const action = parts[0];

  try {
    if (action === 'h_done' || action === 'h_min' || action === 'h_skip' || action === 'h_later') {
      const habitId = parseInt(parts[1], 10);
      const date = parts[2];
      let status: 'done' | 'minimum' | 'skipped' | 'later' = 'done';
      if (action === 'h_min') status = 'minimum';
      if (action === 'h_skip') status = 'skipped';
      if (action === 'h_later') status = 'later';

      await logHabit(env.DB, habitId, date, status);
      await calculateAndSaveDailyScore(env.DB, userId, date);
      
      await answerCallbackQuery(env, cq.id, "Holat saqlandi!");
      
      // Update the message inline keyboard
      await showTodayTasks(env, chatId, userId, cq.message?.message_id);
      return true;
    }

    const state = session.userState;

    if (action === 'h_time') {
      const selectedTime = parts[1];
      if (state && typeof state === 'object' && state.mode === 'habit_time') {
        state.mode = 'habit_minimum';
        state.time = selectedTime;
        session.userState = state;
        await sendMessage(env, chatId, `⏰ Eslatma vaqti: *${selectedTime}* o'rnatildi.\n\nEndi odatning *Eng kichik (minimum) versiyasini* kiriting.\nMasalan: '1 bet kitob o'qish' yoki 'Krossovkalarni kiyib chiqish'.`, {
          replyMarkup: {
            inline_keyboard: [[{ text: "O'tkazish", callback_data: 'h_min_skip' }]]
          }
        });
      }
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_time_skip') {
      if (state && typeof state === 'object' && state.mode === 'habit_time') {
        state.mode = 'habit_minimum';
        state.time = null;
        session.userState = state;
        await sendMessage(env, chatId, "Yaxshi, eslatma o'rnatilmadi.\n\nEndi odatning *Eng kichik (minimum) versiyasini* kiriting.\nMasalan: '1 bet kitob o'qish' yoki 'Krossovkalarni kiyib chiqish'.", {
          replyMarkup: {
            inline_keyboard: [[{ text: "O'tkazish", callback_data: 'h_min_skip' }]]
          }
        });
      }
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_min_skip') {
      if (state && typeof state === 'object' && state.mode === 'habit_minimum') {
        state.mode = 'habit_ifthen';
        state.minimum = null;
        session.userState = state;
        await sendMessage(env, chatId, "Tushunarli.\n\nEndi *Agar-Unda (If-Then)* rejasini kiritishingiz mumkin.\nMasalan: 'Agar charchagan bo'lsam, unda faqat 5 daqiqa shug'ullanaman'. (Yoki 'O'tkazish' ni bosing)", {
          replyMarkup: {
            inline_keyboard: [[{ text: "O'tkazish", callback_data: 'h_ifthen_skip' }]]
          }
        });
      }
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_ifthen_skip') {
      if (state && typeof state === 'object' && state.mode === 'habit_ifthen') {
        await createHabit(env.DB, userId, state.name, state.time, state.minimum, null);
        await env.DB.prepare("UPDATE users SET start_date = COALESCE(start_date, date('now', '+5 hours')) WHERE user_id = ?").bind(userId).run();
        session.userState = null;
        await sendMessage(env, chatId, "✅ Yangi odat muvaffaqiyatli saqlandi!\n\n📋 *Bugungi vazifalar* menyusidan tekshirishingiz mumkin.");
      }
      await answerCallbackQuery(env, cq.id);
      return true;
    }
    
    if (action === 'h_manage') {
      await showHabitManagement(env, chatId, userId);
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_del') {
      const habitId = parseInt(parts[1], 10);
      await sendMessage(env, chatId, "Rostdan ham bu odatni o'chirmoqchimisiz?", {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "✅ Ha, o'chirish", callback_data: `h_del_confirm:${habitId}` }],
            [{ text: "❌ Bekor qilish", callback_data: 'h_del_cancel' }]
          ]
        }
      });
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_del_confirm') {
      const habitId = parseInt(parts[1], 10);
      await deactivateHabit(env.DB, habitId, userId);
      await editMessageText(env, chatId, cq.message?.message_id!, "✅ Odat o'chirildi.");
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_del_cancel') {
      await editMessageText(env, chatId, cq.message?.message_id!, "❌ O'chirish bekor qilindi.");
      await answerCallbackQuery(env, cq.id);
      return true;
    }

    if (action === 'h_refresh') {
      await showTodayTasks(env, chatId, userId, cq.message?.message_id);
      await answerCallbackQuery(env, cq.id, "Yangilandi");
      return true;
    }

  } catch (e) {
    console.error(e);
  }

  return false;
}

async function showTodayTasks(env: Env, chatId: number, userId: number, messageId?: number): Promise<void> {
  const date = getCurrentDate();
  const tasks = await getHabitLogsForDate(env.DB, userId, date);
  
  if (tasks.length === 0) {
    const text = "Bugun uchun vazifalar yo'q. Yangi odat qo'shish uchun '➕ Yangi odat' tugmasini bosing.";
    if (messageId) {
      await editMessageText(env, chatId, messageId, text);
    } else {
      await sendMessage(env, chatId, text);
    }
    return;
  }

  let text = `📋 *Bugungi vazifalar (${date})*\n\n`;
  const keyboard: any[] = [];

  const icons: Record<string, string> = {
    'done': '✅',
    'minimum': '🟡',
    'skipped': '⏭',
    'later': '⏰',
    'pending': '⬜'
  };

  tasks.forEach((task, index) => {
    const statusIcon = icons[task.status] || '⬜';
    text += `${index + 1}. ${statusIcon} *${task.name}*\n`;
    if (task.if_then_plan) {
      text += `   _Agar-Unda:_ ${task.if_then_plan}\n`;
    }
    
    keyboard.push([
      { text: `✅ Bajarildi`, callback_data: `h_done:${task.id}:${date}` },
      { text: `🟡 Minimum`, callback_data: `h_min:${task.id}:${date}` }
    ]);
    keyboard.push([
      { text: `⏭ O'tkazish`, callback_data: `h_skip:${task.id}:${date}` },
      { text: `⏰ Keyinroq`, callback_data: `h_later:${task.id}:${date}` }
    ]);
  });

  keyboard.push([{ text: `🔄 Yangilash`, callback_data: `h_refresh` }]);
  keyboard.push([{ text: `⚙️ Boshqarish`, callback_data: `h_manage` }]);

  if (messageId) {
    await editMessageText(env, chatId, messageId, text, { replyMarkup: { inline_keyboard: keyboard } });
  } else {
    await sendMessage(env, chatId, text, { replyMarkup: { inline_keyboard: keyboard } });
  }
}

async function startHabitCreation(env: Env, session: Session, chatId: number): Promise<void> {
  session.userState = { mode: 'habit_name' };
  await sendMessage(env, chatId, "Yangi odat nomini kiriting:\n(Masalan: 'Kitob o'qish' yoki 'Yugurish')");
}

async function handleHabitNameInput(env: Env, session: Session, chatId: number, userId: number, text: string): Promise<void> {
  session.userState = { mode: 'habit_time', name: text };
  await sendMessage(env, chatId, "Odat uchun eslatma vaqtini kiriting (HH:MM formatida):\n(Yoki quyidagi tugmalardan birini tanlang)", {
    replyMarkup: {
      inline_keyboard: [
        [{ text: "05:30", callback_data: 'h_time:05:30' }, { text: "07:00", callback_data: 'h_time:07:00' }, { text: "09:00", callback_data: 'h_time:09:00' }],
        [{ text: "12:00", callback_data: 'h_time:12:00' }, { text: "18:00", callback_data: 'h_time:18:00' }, { text: "21:00", callback_data: 'h_time:21:00' }],
        [{ text: "O'tkazish", callback_data: 'h_time_skip' }]
      ]
    }
  });
}

async function handleHabitTimeInput(env: Env, session: Session, chatId: number, text: string): Promise<void> {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  let timeStr = text.trim();
  if (!timeRegex.test(timeStr)) {
    await sendMessage(env, chatId, "Iltimos, vaqtni to'g'ri formatda kiriting (Masalan, 07:00):");
    return;
  }
  
  session.userState.mode = 'habit_minimum';
  session.userState.time = timeStr;
  await sendMessage(env, chatId, `⏰ Eslatma vaqti: *${timeStr}* o'rnatildi.\n\nEndi odatning *Eng kichik (minimum) versiyasini* kiriting.\nMasalan: '1 bet kitob o'qish' yoki 'Krossovkalarni kiyib chiqish'.`, {
    replyMarkup: {
      inline_keyboard: [[{ text: "O'tkazish", callback_data: 'h_min_skip' }]]
    }
  });
}

async function handleHabitMinimumInput(env: Env, session: Session, chatId: number, text: string): Promise<void> {
  session.userState.mode = 'habit_ifthen';
  session.userState.minimum = text;
  await sendMessage(env, chatId, "Minimum versiya saqlandi.\n\nEndi *Agar-Unda (If-Then)* rejasini kiritishingiz mumkin.\nMasalan: 'Agar charchagan bo'lsam, unda faqat 5 daqiqa shug'ullanaman'.", {
    replyMarkup: {
      inline_keyboard: [[{ text: "O'tkazish", callback_data: 'h_ifthen_skip' }]]
    }
  });
}

async function handleHabitIfThenInput(env: Env, session: Session, chatId: number, userId: number, text: string): Promise<void> {
  const state = session.userState;
  await createHabit(env.DB, userId, state.name, state.time, state.minimum, text);
  await env.DB.prepare("UPDATE users SET start_date = COALESCE(start_date, date('now', '+5 hours')) WHERE user_id = ?").bind(userId).run();
  session.userState = null;
  await sendMessage(env, chatId, "✅ Yangi odat muvaffaqiyatli saqlandi!\n\n📋 *Bugungi vazifalar* menyusidan tekshirishingiz mumkin.");
}

async function showHabitManagement(env: Env, chatId: number, userId: number): Promise<void> {
  const habits = await getActiveHabits(env.DB, userId);
  
  if (habits.length === 0) {
    await sendMessage(env, chatId, "Sizda faol odatlar yo'q.");
    return;
  }

  let text = "⚙️ *Odatlarni boshqarish*\n\nO'chirish uchun odatni tanlang:";
  const keyboard: any[] = [];
  
  habits.forEach(h => {
    keyboard.push([{ text: `❌ ${h.name}`, callback_data: `h_del:${h.id}` }]);
  });

  await sendMessage(env, chatId, text, { replyMarkup: { inline_keyboard: keyboard } });
}
