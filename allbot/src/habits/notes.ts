import { Env } from '../types';
import { sendMessage } from '../telegram';
import { appendHabitNote, getHabitOwnedBy } from './db';

// Habits whose name contains one of these words (case-insensitive) ask for a result/comment
// after being marked "done". Edit this list to change which habits are asked.
export const NOTE_HABIT_KEYWORDS = ['reading', 'writing', 'listening', 'speaking', 'vocabulary', 'youtube'];

export const NOTE_TTL_MS = 30 * 60 * 1000;  // pending question expires after 30 minutes
export const NOTE_MAX_LENGTH = 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AwaitingNote {
  habit_id: number;
  date: string;  // YYYY-MM-DD (Asia/Tashkent)
  ts: number;    // epoch ms when the question was asked
}

export function habitAsksForNote(habitName: string): boolean {
  const name = habitName.toLowerCase();
  return NOTE_HABIT_KEYWORDS.some(k => name.includes(k));
}

// Reads {"awaiting_note": {...}} out of session.userState (null if absent or malformed).
export function getAwaitingNote(userState: unknown): AwaitingNote | null {
  if (!userState || typeof userState !== 'object') return null;
  const a = (userState as any).awaiting_note;
  if (!a || typeof a.habit_id !== 'number' || typeof a.date !== 'string' || typeof a.ts !== 'number') return null;
  return a as AwaitingNote;
}

export function isNoteExpired(a: AwaitingNote, now: number = Date.now()): boolean {
  return now - a.ts > NOTE_TTL_MS;
}

// A multi-step habit/channel flow must not be overwritten by a note question.
function isBusyWithOtherFlow(state: unknown): boolean {
  if (typeof state === 'string') return state.startsWith('habit_') || state === 'setting_channel';
  if (state && typeof state === 'object') {
    const mode = (state as any).mode;
    return typeof mode === 'string' && (mode.startsWith('habit_') || mode === 'editing');
  }
  return false;
}

// Called after a habit was marked "done": asks for a result/comment if this habit needs one.
// Any older pending question is replaced (only one note is awaited at a time).
export async function maybeAskForNote(env: Env, session: { userState: any }, chatId: number, userId: number, habitId: number, date: string): Promise<void> {
  if (getAwaitingNote(session.userState)) session.userState = null;
  if (!DATE_RE.test(date) || !Number.isInteger(habitId)) return;

  const habit = await getHabitOwnedBy(env.DB, habitId, userId);
  if (!habit || !habitAsksForNote(habit.name)) return;
  if (isBusyWithOtherFlow(session.userState)) return;

  session.userState = { awaiting_note: { habit_id: habitId, date, ts: Date.now() } };
  // Plain text (no parse mode): habit names may contain Markdown characters
  await sendMessage(env, chatId, `${habit.name} natijasi yoki izohi? (masalan: 28/40, xatolar: 3, 7)`, {
    parseMode: null,
    replyMarkup: { inline_keyboard: [[{ text: "O'tkazib yuborish", callback_data: `h_note_skip:${habitId}:${date}` }]] }
  });
}

// Plain text sent while a note is awaited: saved as the note (appended on a new line if one exists).
export async function handleNoteInput(env: Env, session: { userState: any }, chatId: number, userId: number, text: string): Promise<void> {
  const pending = getAwaitingNote(session.userState);
  if (!pending) return;

  const note = Array.from(text.trim()).slice(0, NOTE_MAX_LENGTH).join('');
  if (!note) {
    await sendMessage(env, chatId, "Iltimos, izohni matn ko'rinishida yozing yoki \"O'tkazib yuborish\" tugmasini bosing.", { parseMode: null });
    return;
  }

  const saved = await appendHabitNote(env.DB, userId, pending.habit_id, pending.date, note);
  session.userState = null;
  await sendMessage(env, chatId, saved ? 'Saqlandi ✅' : "Izohni saqlab bo'lmadi (odat topilmadi).", { parseMode: null });
}
