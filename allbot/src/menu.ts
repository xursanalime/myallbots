import { replyKeyboard } from './telegram';
import { ReplyMarkup } from './types';
export function mainMenu(): ReplyMarkup {
  return replyKeyboard([
    ['📋 Bugungi vazifalar', '📊 Statistika'],
    ['➕ Yangi odat', '📚 Lug\'at'],
    ['🤖 AI yordamchi', '⚙️ Sozlamalar']
  ]);
}

export function isMainMenuButton(text: string): boolean {
  const buttons = [
    '📋 Bugungi vazifalar', '📊 Statistika',
    '➕ Yangi odat', '📚 Lug\'at',
    '🤖 AI yordamchi', '⚙️ Sozlamalar'
  ];
  return buttons.includes(text);
}
