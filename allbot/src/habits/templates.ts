import { createHabit, getActiveHabits, deactivateHabit } from './db';

export interface Phase1HabitDef {
  name: string;
  reminder_time: string | null;
  minimum_version_text: string;
  if_then_plan: string;
}

export const PHASE_1_HABITS: Phase1HabitDef[] = [
  {
    name: '🌅 Erta turish & Bomdod',
    reminder_time: '05:30',
    minimum_version_text: '2 rakat farz namozi',
    if_then_plan: "Agar uyqu bosgan bo'lsa, sovuq suvda yuvinib farzini o'qiyman"
  },
  {
    name: '🏃 Ertalabki harakat (stretching/yurish)',
    reminder_time: '05:45',
    minimum_version_text: '5 daqiqa stretching yoki 10 ta otjimaniya',
    if_then_plan: "Agar vaqt oz bo'lsa, shunchaki 10 ta otjimaniya qilaman"
  },
  {
    name: '🍅 IELTS Pomodoro 1-2 (L/R fundament)',
    reminder_time: '07:00',
    minimum_version_text: '1 ta Section yoki 15 daqiqa BBC podkast',
    if_then_plan: "Agar qiyin bo'lsa, 1 ta BBC 6 Minute English tinglayman"
  },
  {
    name: '🍅 IELTS Pomodoro 3-4 (Grammar/Vocab)',
    reminder_time: '08:20',
    minimum_version_text: "5 ta yangi so'z (Leitner) yoki 1 ta qoida",
    if_then_plan: "Agar charchagan bo'lsam, AllBot dagi Quti 1 so'zlarini takrorlayman"
  },
  {
    name: '🕌 Xufton namozi',
    reminder_time: '20:00',
    minimum_version_text: '4 rakat farz namozi',
    if_then_plan: "Uxlashdan oldin albatta 4 rakat farzni o'qiyman"
  },
  {
    name: '📱 Ekran off & Kunlik WIN',
    reminder_time: '21:30',
    minimum_version_text: "Bugungi 1 ta yutuqni (WIN) botga yozish",
    if_then_plan: "Telefonni boshqa xonaga qo'yaman va 22:00 da uxlayman"
  }
];

export async function setupPhase1Habits(
  db: D1Database,
  userId: number,
  replaceExisting: boolean = false
): Promise<{ added: number; replaced: number }> {
  let replaced = 0;
  if (replaceExisting) {
    const existing = await getActiveHabits(db, userId);
    for (const h of existing) {
      await deactivateHabit(db, h.id, userId);
      replaced++;
    }
  }

  let added = 0;
  for (const h of PHASE_1_HABITS) {
    await createHabit(db, userId, h.name, h.reminder_time, h.minimum_version_text, h.if_then_plan, null);
    added++;
  }

  // Foydalanuvchi boshlash sanasini belgilash
  await db.prepare("UPDATE users SET start_date = COALESCE(start_date, date('now', '+5 hours')) WHERE user_id = ?").bind(userId).run();

  return { added, replaced };
}
