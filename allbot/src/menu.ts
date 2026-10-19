import { replyKeyboard } from './telegram';
import { ReplyMarkup } from './types';

export function mainMenu(): ReplyMarkup {
  return replyKeyboard([
    ['📋 Bugungi vazifalar', '📊 Statistika'],
    ['🎯 IELTS Reja', '🚨 SOS Yordam'],
    ['➕ Yangi odat', '📚 Lug\'at'],
    ['⚙️ Sozlamalar']
  ]);
}

export function isMainMenuButton(text: string): boolean {
  const buttons = [
    '📋 Bugungi vazifalar', '📊 Statistika',
    '🎯 IELTS Reja', '🚨 SOS Yordam',
    '➕ Yangi odat', '📚 Lug\'at',
    '⚙️ Sozlamalar'
  ];
  return buttons.includes(text);
}
