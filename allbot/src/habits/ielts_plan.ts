import { ReplyMarkup } from '../types';

export function getIeltsPlanMessage(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🎯 *IELTS 8.0 STRATEGIYASI VA YO'L XARITASI*\n\n` +
    `📊 *Boshlang'ich daraja:* Mock Band 5.0\n` +
    `🏆 *Maqsad:* Band 8.0 (minimal 7.5)\n` +
    `⏳ *Muddat:* 31-dekabr 2026 (~73 kun / 10.5 hafta)\n` +
    `👨‍🏫 *Repetitor:* Du / Chor / Ju (15:20–17:20)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *10 HAFTALIK BOSQICHLAR:*\n\n` +
    `🔹 *1–2-hafta (POYDEVOR):* Hozirgi bosqich!\n` +
    `• Kuniga 4 ta Pomodoro (1.5–2 soat sof ish)\n` +
    `• 2 vaqt namoz (Bomdod + Xufton)\n` +
    `• Grammatika asoslari, BBC podkastlar, so'z boyligi\n` +
    `• Instagram: < 1 soat, Porno: 3 kunda 1 marta / 0 ga qarab\n\n` +
    `🔹 *3–4-hafta (MOMENTUM):*\n` +
    `• 8–10 ta Pomodoro (4–5 soat)\n` +
    `• 4 vaqt namoz, Task 1 & 2 strukturalari, mock 6.0+\n\n` +
    `🔹 *5–7-hafta (DEEP WORK):*\n` +
    `• 14–16 ta Pomodoro (7–8 soat)\n` +
    `• 5 vaqt namoz, 1.25x Listening, Speaking erkin nutq\n\n` +
    `🔹 *8–10-hafta (IMTIHON SIMULYATSIYASI):*\n` +
    `• Haftada 2 ta to'liq Mock test, 8.0 barqaror natija\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Asosiy qoida:* "70% bajarilgan ish — 0% dan cheksiz marta yaxshi. Never miss twice!"`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: "⚡ Faza 1 odatlarini o'rnatish", callback_data: "faza1_confirm_prompt" }],
      [{ text: "📋 Bugungi vazifalar", callback_data: "h_back" }]
    ]
  };

  return { text, replyMarkup };
}
