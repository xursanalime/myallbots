import { ReplyMarkup } from '../types';

export function getSosMessage(): { text: string; replyMarkup: ReplyMarkup } {
  const text =
    `🚨 *FAVQULODDA PROTOKOL (SOS / Urge Surfing)*\n\n` +
    `Miyangizda kuchli chalg'ish yoki zararli istak (Instagram, porno yoki dangasalik) uyg'ondimi? ` +
    `Xotirjam bo'ling — bu to'lqin 5–10 daqiqada o'tib ketadi.\n\n` +
    `*HOZIROQ QUYIDAGI 5 QADAMNI BAJARING:*\n\n` +
    `1️⃣ 📵 *Telefonni qo'ying!* Uni stolda qoldirib, xonadan chiqing.\n` +
    `2️⃣ 💧 *Sovuq suvda yuvining yoki tahorat oling.* Sovuq suv pulsni tushiradi va miyani zudlik bilan tetiklashtiradi (Diving reflex).\n` +
    `3️⃣ 🏋️ *20 ta otjimaniya yoki 30 ta squat qiling.* Jismoniy harakat dopamin to'lqinini to'g'ri kanalga buradi.\n` +
    `4️⃣ 🌊 *5 daqiqa kuting (Urge surfing).* Istakka qarshi kurashmang, chuqur nafas oling va to'lqin so'nishini kuzating.\n` +
    `5️⃣ 🛡️ *70% QOIDASI:* Hech narsa buzilgani yo'q! "Never miss twice" — hoziroq 2 daqiqalik bitta kichik harakat bilan darsga qayting.\n\n` +
    `🎯 _Sizning maqsadingiz — IELTS 8.0. Har bir engilgan vasvasa sizni yangi darajaga olib chiqadi!_`;

  const replyMarkup: ReplyMarkup = {
    inline_keyboard: [
      [{ text: "💪 Yengdim! Darsga qaytdim", callback_data: "sos_recovered" }],
      [{ text: "📋 Bugungi vazifalar", callback_data: "h_back" }]
    ]
  };

  return { text, replyMarkup };
}

export function getSosRecoveredText(): string {
  return (
    `🏆 *BARAKALLA! Katta g'alaba!*\n\n` +
    `Siz hozir eng xavfli to'siqni yengdingiz. Miyangizdagi dopamin reseptorlari aynan shunday paytlarda davolanadi va iroda mustahkamlanadi.\n\n` +
    `Endi diqqatni jamlab, bugungi Pomodoro blokiga kirishing. Olg'a! 🚀`
  );
}
