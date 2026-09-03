// Cloudflare Workers environment bindings
export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  OPENROUTER_API_KEY: string;
  CHANNEL_ID?: string;
}

// Habit check-in status
export type HabitStatus = 'done' | 'minimum' | 'skipped' | 'pending' | 'later';

// Session state for the unified bot
export interface Session {
  userState: UserState | null;
  quizState: QuizState | null;
}

// User state - tracks what the user is currently doing
export type UserState =
  | 'adding'              // vocab: adding words
  | 'searching'           // vocab: searching words  
  | { mode: 'editing'; word_id: number; uz: string }  // vocab: editing a word
  | 'habit_name'          // habits: entering habit name
  | 'habit_time'          // habits: entering reminder time
  | 'habit_minimum'       // habits: entering minimum version text
  | 'habit_ifthen'        // habits: entering if-then plan
  | { mode: 'habit_note'; habit_id: number; date: string }  // habits: entering note for skipped habit
  | { mode: 'habit_delete' }  // habits: selecting habit to delete
  | 'setting_channel'     // channel: entering channel ID or username
  | 'ai_chat'             // AI: free chat mode
  | string;               // fallback for string-based states

// Vocab quiz state (from BrainBridge, unchanged)
export interface QuizState {
  words: [number, string, string][];  // [id, uz, eng]
  index: number;
  correct: number;
  wrong: [string, string][];  // [uz, eng]
  mode: string;  // 'new' | 'all' | 'box_N'
  box?: number;
  currentOptions?: string[] | null;
  currentCorrect?: string | null;
  currentWid?: number | null;
  currentUz?: string | null;
  currentEng?: string | null;
}

// Temporary state for habit creation flow
export interface HabitCreationState {
  name?: string;
  reminder_time?: string | null;
  minimum_version_text?: string | null;
  if_then_plan?: string | null;
}

// Database row types
export interface UserRow {
  user_id: number;
  first_name: string | null;
  notify: number;
  last_notified: string | null;
  free_mode: number;
  xp: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  last_streak_warning_date: string | null;
  last_reengagement_at: string | null;
  last_weekly_summary_at: string | null;
  ai_enabled: number;
  timezone: string;
  start_date: string | null;
  channel_id?: string | null;
  channel_report_enabled?: number;
  last_channel_report_date?: string | null;
  created_at: string;
}

export interface WordRow {
  id: number;
  user_id: number;
  uz: string;
  eng: string;
  box: number;
  next_review: string;
  created_at: string;
}

export interface BadgeRow {
  id: number;
  user_id: number;
  code: string;
  earned_at: string;
}

export interface HabitRow {
  id: number;
  user_id: number;
  name: string;
  reminder_time: string | null;
  minimum_version_text: string | null;
  if_then_plan: string | null;
  created_at: string;
  active: number;
}

export interface HabitLogRow {
  id: number;
  habit_id: number;
  date: string;
  status: HabitStatus;
  note: string | null;
  logged_at: string;
}

export interface DailyScoreRow {
  user_id: number;
  date: string;
  total_score: number;
  habit_count: number;
  streak_count: number;
  is_success_day: number;
  is_full_day: number;
}

// Telegram types (minimal, what we actually use)
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  channel_post?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
  forward_from_chat?: TelegramChat;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface ReplyMarkup {
  keyboard?: { text: string }[][];
  inline_keyboard?: InlineButton[][];
  resize_keyboard?: boolean;
}

export interface InlineButton {
  text: string;
  callback_data?: string;
}

export interface SendMessageOpts {
  parseMode?: string | null;
  replyMarkup?: ReplyMarkup;
}
