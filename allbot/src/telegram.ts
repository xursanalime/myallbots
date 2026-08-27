import { Env, ReplyMarkup, InlineButton, SendMessageOpts } from './types';

export function replyKeyboard(rows: string[][]): ReplyMarkup {
  return {
    keyboard: rows.map(row => row.map(text => ({ text }))),
    resize_keyboard: true
  };
}

export function inlineKeyboard(rows: InlineButton[][]): ReplyMarkup {
  return {
    inline_keyboard: rows
  };
}

export async function api(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return await response.json();
}

export async function sendMessage(env: Env, chatId: number, text: string, opts: SendMessageOpts = {}): Promise<any> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text
  };

  const parseMode = opts.parseMode === undefined ? 'Markdown' : opts.parseMode;
  if (parseMode) payload.parse_mode = parseMode;

  if (opts.replyMarkup) {
    payload.reply_markup = opts.replyMarkup;
  }

  return await api(env, 'sendMessage', payload);
}

export async function answerCallbackQuery(env: Env, callbackId: string, text?: string): Promise<any> {
  const payload: Record<string, unknown> = {
    callback_query_id: callbackId
  };

  if (text) {
    payload.text = text;
  }

  return await api(env, 'answerCallbackQuery', payload);
}

export async function editMessageText(env: Env, chatId: number, messageId: number, text: string, opts: SendMessageOpts = {}): Promise<any> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: text
  };

  const parseMode = opts.parseMode === undefined ? 'Markdown' : opts.parseMode;
  if (parseMode) payload.parse_mode = parseMode;

  if (opts.replyMarkup) {
    payload.reply_markup = opts.replyMarkup;
  }

  return await api(env, 'editMessageText', payload);
}

export async function sendDocument(env: Env, chatId: number, filename: string, content: string, caption?: string): Promise<any> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`;
  
  const formData = new FormData();
  formData.append('chat_id', chatId.toString());
  
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
  }

  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
  formData.append('document', blob, filename);

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  return await response.json();
}
