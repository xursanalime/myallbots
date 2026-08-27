import { Env, Session, TelegramMessage, TelegramCallbackQuery } from '../types';
import { replyKeyboard, inlineKeyboard, sendMessage, editMessageText, sendDocument, answerCallbackQuery } from '../telegram';
import { 
  countBox, countDueBox, getAllWords, getNotify, getFreeMode, 
  wordsNew, wordsDue, secondsUntilDue, secondsUntilDueBox, wordsInBox,
  stats, getXp, getStreak, getBadgeCodes, leaderboard, userRank, searchWords,
  updateWordEng, parseSynonyms, getWordById, updateBox, setNotify, setFreeMode,
  deleteAll, deleteWord, registerUser, addWord
} from './db';
import { levelProgress, xpToLevel, onWordAdded, onCorrectAnswer, onTestFinished, BADGES } from './gamification';

export const BOX_ICON = ["\u{1F195}", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "\u{1F3C6}"];
export const PAGE_SIZE = 8;

export function vocabMenu(): any {
  return replyKeyboard([
    ["\u2795 So'z qo'shish", "\u{1F501} Takrorlash"],
    ["\u{1F3C6} Yutuqlar", "\u{1F3C5} Reyting"],
    ["\u{1F4CA} Statistika", "\u2699\uFE0F Sozlamalar"],
    ["\u{1F519} Asosiy menyu"]
  ]);
}

export function backMenu(): any {
  return replyKeyboard([["\u{1F519} Orqaga"]]);
}

export async function boxMenu(env: Env, uid: number): Promise<any> {
  const labels = [];
  for (let i = 1; i <= 5; i++) {
    const t = await countBox(env.DB, uid, i);
    const d = await countDueBox(env.DB, uid, i);
    const badge = d > 0 ? `\u{1F534}${d}` : "\u2705";
    labels.push(`\u{1F4E6} Quti ${i} (${badge}/${t})`);
  }
  return replyKeyboard([
    [labels[0], labels[1]],
    [labels[2], labels[3]],
    [labels[4], "\u{1F4DD} Test (Yangi)"],
    ["\u{1F519} Orqaga"]
  ]);
}

export function esc(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text).replace(/([_*`\[])/g, "\\$1");
}

export function splitPair(line: string): [string, string] | null {
  for (const sep of ["=", "\u2014", "\u2013", "-"]) {
    const idx = line.indexOf(sep);
    if (idx !== -1) {
      return [line.slice(0, idx), line.slice(idx + sep.length)];
    }
  }
  return null;
}

export function fmtWait(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return "hozir";
  const totalMin = Math.floor(seconds / 60);
  const days = Math.floor(totalMin / 1440);
  const rem = totalMin % 1440;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;
  if (days > 0) return `${days} kun ${hours} soat`;
  if (hours > 0) return `${hours} soat ${mins} daqiqa`;
  return `${mins} daqiqa`;
}

export function bar(done: number, total: number, w: number = 10): string {
  const f = total ? Math.floor((done / total) * w) : 0;
  return "\u2588".repeat(f) + "\u2591".repeat(w - f);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function sendPage(env: Env, uid: number, chatId: number, page: number = 0): Promise<void> {
  const words = await getAllWords(env.DB, uid);
  const total = words.length;
  if (total === 0) {
    await sendMessage(env, chatId, "\u{1F4ED} So'zlar ro'yxati bo'sh.", { replyMarkup: vocabMenu() });
    return;
  }
  words.sort((a, b) => b.box - a.box || a.uz.localeCompare(b.uz));
  const pages = Math.ceil(total / PAGE_SIZE);
  page = Math.max(0, Math.min(page, pages - 1));
  const pageWords = words.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lines: string[] = [];
  const kbRows: any[] = [];
  let rowBtns: any[] = [];
  pageWords.forEach((w, i) => {
    const n = i + 1;
    const icon = BOX_ICON[Math.min(w.box, 5)];
    lines.push(`${n}. ${icon} *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\``);
    rowBtns.push({ text: `${n} \u270F\uFE0F`, callback_data: `edit_${w.id}` });
    rowBtns.push({ text: `${n} \u{1F5D1}`, callback_data: `del_${w.id}` });
    if (rowBtns.length === 4) {
      kbRows.push(rowBtns);
      rowBtns = [];
    }
  });
  if (rowBtns.length) kbRows.push(rowBtns);
  const text = `\u{1F4CB} *So'zlarim* \u2014 ${page + 1}/${pages} sahifa (${total} ta jami)\n\n` + lines.join("\n");
  const navBtns = [];
  if (page > 0) navBtns.push({ text: "\u2B05\uFE0F Oldingi", callback_data: `page_${uid}_${page - 1}` });
  if (page + 1 < pages) navBtns.push({ text: "Keyingi \u27A1\uFE0F", callback_data: `page_${uid}_${page + 1}` });
  if (navBtns.length) kbRows.push(navBtns);
  await sendMessage(env, chatId, text, { replyMarkup: inlineKeyboard(kbRows) });
}

export async function sendWordCards(env: Env, uid: number, words: any[], header: string = ""): Promise<void> {
  const lines: string[] = [];
  const kbRows: any[] = [];
  let rowBtns: any[] = [];
  words.forEach((w, i) => {
    const n = i + 1;
    const icon = BOX_ICON[Math.min(w.box, 5)];
    lines.push(`${n}. ${icon} *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\``);
    rowBtns.push({ text: `${n} \u270F\uFE0F`, callback_data: `edit_${w.id}` });
    rowBtns.push({ text: `${n} \u{1F5D1}`, callback_data: `del_${w.id}` });
    if (rowBtns.length === 4) {
      kbRows.push(rowBtns);
      rowBtns = [];
    }
  });
  if (rowBtns.length) kbRows.push(rowBtns);
  const text = header + "\n\n" + lines.join("\n");
  await sendMessage(env, uid, text, { replyMarkup: inlineKeyboard(kbRows) });
}

export async function settingsKb(env: Env, uid: number): Promise<any> {
  const on = await getNotify(env.DB, uid);
  const notifyBtn = on ? { text: "\u{1F515} Bildirishnomani o'chirish", callback_data: "notify_off" } : { text: "\u{1F514} Bildirishnomani yoqish", callback_data: "notify_on" };
  const free = await getFreeMode(env.DB, uid);
  const modeBtn = free ? { text: "\u23F0 Rejalashtirilgan rejimga o'tish", callback_data: "mode_scheduled" } : { text: "\u{1F513} Erkin rejimga o'tish", callback_data: "mode_free" };
  return inlineKeyboard([
    [notifyBtn, { text: "\u{1F4CB} So'zlarim", callback_data: "settings_words" }],
    [
      { text: "\u{1F4DD} Barcha so'zlar", callback_data: "settings_all_test" },
      { text: "\u{1F50D} Qidirish", callback_data: "settings_search" }
    ],
    [
      { text: "\u{1F4E4} Eksport qilish", callback_data: "export_words" },
      { text: "\u274C Tozalash", callback_data: "clear_open" }
    ],
    [modeBtn]
  ]);
}

export async function settingsText(env: Env, uid: number): Promise<string> {
  const on = await getNotify(env.DB, uid);
  const holat = on ? "\u{1F514} *Yoqilgan*" : "\u{1F515} *O'chirilgan*";
  const free = await getFreeMode(env.DB, uid);
  const rejim = free ? "\u{1F513} *Erkin* \u2014 istalgan vaqtda takrorlash mumkin" : "\u23F0 *Rejalashtirilgan* \u2014 faqat vaqti kelgan so'zlar takrorlanadi";
  return `\u2699\uFE0F *Sozlamalar*\n\n\u{1F4E2} Bildirishnoma: ${holat}\n\u{1F501} Takrorlash rejimi: ${rejim}\n\n\u{1F4A1} Bildirishnoma yoqilganda, takrorlash vaqti kelgan so'zlaringiz haqida sizga avtomatik eslatma yuboriladi (rejimdan qat'i nazar).\n\n\u{1F4A1} Erkin rejimda so'zlarni kutish vaqtisiz istalgan paytda takrorlashingiz mumkin. Rejalashtirilgan rejimda esa har bir so'z faqat o'z Leitner vaqti kelganda tayyor bo'ladi.`;
}

export async function startAllTest(env: Env, session: Session, uid: number, chatId: number): Promise<void> {
  const words = await getAllWords(env.DB, uid);
  if (words.length === 0) {
    await sendMessage(env, chatId, "\u{1F4ED} *So'zlar ro'yxati bo'sh!*\n\n\u{1F4A1} *\u2795 So'z qo'shish* orqali yangi so'zlar qo'shing.", {
      replyMarkup: vocabMenu()
    });
    return;
  }
  const shuffled = shuffle(words);
  session.quizState = {
    words: shuffled.map((w: any) => [w.id, w.uz, w.eng]),
    index: 0,
    correct: 0,
    wrong: [],
    mode: "all"
  };
  await sendMessage(
    env,
    chatId,
    `\u270D\uFE0F *Barcha So'zlar \u2014 Test*\n\n\u{1F4DA} Jami: *${words.length} ta* so'z\n\u{1F4DD} _O'zbekchasi beriladi \u2014 4 ta variantdan to'g'risini tanlang. Xato bo'lsa so'z Quti 1 ga qaytadi._\n\u{1F4AA} Muvaffaqiyat!`,
    { replyMarkup: backMenu() }
  );
  await askQ(env, session, uid, chatId);
}

export async function askQuiz(env: Env, session: Session, uid: number, chatId: number): Promise<void> {
  const quiz = session.quizState;
  if (!quiz) return;
  if (quiz.index >= quiz.words.length) {
    await finish(env, session, uid, chatId);
    return;
  }
  const [wid, uz, eng] = quiz.words[quiz.index];
  const correctText = parseSynonyms(eng)[0] || eng;
  const allWords = await getAllWords(env.DB, uid);
  const pool: string[] = [];
  const seen = new Set([correctText.toLowerCase()]);
  for (const w of shuffle(allWords)) {
    if (w.id === wid) continue;
    const t = parseSynonyms(w.eng)[0];
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(t);
    if (pool.length >= 3) break;
  }
  const options = shuffle([correctText, ...pool]);
  quiz.currentOptions = options;
  quiz.currentCorrect = correctText;
  quiz.currentWid = wid;
  quiz.currentUz = uz;
  quiz.currentEng = eng;
  const total = quiz.words.length;
  const curI = quiz.index + 1;
  const pct = Math.floor(quiz.index / total * 100);
  const text = `*${curI}/${total}*  \`[${bar(quiz.index, total)}]\`  ${pct}%\n\n\u{1F1FA}\u{1F1FF} *${esc(uz.toUpperCase())}*\n\n\u2753 To'g'ri tarjimani tanlang:`;
  const kbRows = options.map((opt, i) => [{ text: opt, callback_data: `qz_${i}` }]);
  await sendMessage(env, chatId, text, { replyMarkup: inlineKeyboard(kbRows) });
}

export async function askQ(env: Env, session: Session, uid: number, chatId: number): Promise<void> {
  await askQuiz(env, session, uid, chatId);
}

export async function finish(env: Env, session: Session, uid: number, chatId: number): Promise<void> {
  const quiz = session.quizState;
  session.quizState = null;
  if (!quiz) return;
  const correct = quiz.correct;
  const wrong = quiz.wrong;
  const total = correct + wrong.length;
  const pct = total === 0 ? 0 : Math.floor(correct / total * 100);
  const rating = pct === 100 ? "\u{1F3C6} Mukammal natija!" : pct >= 80 ? "\u{1F31F} A'lo!" : pct >= 60 ? "\u{1F44D} Yaxshi!" : pct >= 40 ? "\u{1F4DA} O'rtacha" : "\u{1F4AA} Davom eting!";
  await sendMessage(
    env,
    chatId,
    `\u{1F3C1} *Test Yakunlandi!*\n\n\u{1F4CA} \`[${bar(correct, total)}]\` *${pct}%*\n\n\u2705 To'g'ri: *${correct}* ta\n\u274C Xato:   *${wrong.length}* ta\n\u{1F4DD} Jami:   *${total}* ta\n\n${rating}`,
    { replyMarkup: vocabMenu() }
  );
  await onTestFinished(env, uid, chatId, pct, total);
  if (wrong.length) {
    const lines = wrong.map(([u, e]: [string, string]) => `  \u2022 *${esc(u)}* \u2192 \`${esc(e)}\``).join("\n");
    await sendMessage(env, chatId, `\u{1F4CB} *Xato so'zlar \u2014 takrorlang:*\n\n${lines}`);
  } else {
    await sendMessage(env, chatId, "\u{1F389} *Barcha javoblar to'g'ri!* Zo'r natija! \u{1F973}");
  }
}

export async function vocabWelcome(env: Env, chatId: number, firstName: string | undefined): Promise<void> {
  await registerUser(env.DB, chatId, firstName || "Do'stim");
  await sendMessage(
    env,
    chatId,
    `\u{1F44B} Salom, *${esc(firstName || "Do'stim")}*!\n\n\u{1F9E0} *BRAINBRIDGE \u2014 So'z Yodlash Boti*\n\n\u{1F4D6} Ingliz so'zlarini *Leitner tizimi* orqali samarali yodlang!\n\n\u{1F4E6} *Takrorlash tartibi:*\nHar bir quti o'z kutish vaqtiga ega: Quti 1 \u2014 4 soat, Quti 2 \u2014 1 kun, Quti 3 \u2014 3 kun, Quti 4 \u2014 7 kun, Quti 5 \u2014 14 kun.\n\u2699\uFE0F *Sozlamalar*'dan istalgan paytda *Erkin rejim*ga o'tib, kutish vaqtisiz ham takrorlashingiz mumkin.\n\n\u2705 *To'g'ri* \u2192 keyingi qutiga \u2B06\uFE0F\n\u274C *Xato*   \u2192 Quti 1 ga \u2B07\uFE0F\n\n\u{1F4A1} Boshlash uchun *\u2795 So'z qo'shish* ni bosing!`,
    { replyMarkup: vocabMenu() }
  );
}

export async function handleVocabMessage(env: Env, session: Session, msg: TelegramMessage): Promise<boolean> {
  const chatId = msg.chat.id;
  const uid = chatId;
  const text = msg.text ?? "";
  const firstName = msg.from?.first_name;

  if (text === "\u{1F519} Orqaga") {
    session.quizState = null;
    session.userState = null;
    await sendMessage(env, chatId, "\u{1F3E0} *Lug'at menyusi*", { replyMarkup: vocabMenu() });
    return true;
  }
  
  if (text === "\u{1F519} Asosiy menyu") {
    session.quizState = null;
    session.userState = null;
    return false; // Let the main router handle going back to main menu
  }

  if (text === "\u2699\uFE0F Sozlamalar") {
    await registerUser(env.DB, uid, firstName || null);
    await sendMessage(env, chatId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    return true;
  }
  if (text === "\u2795 So'z qo'shish") {
    session.userState = "adding";
    await sendMessage(
      env,
      chatId,
      "\u270F\uFE0F *So'z Qo'shish*\n\n\u{1F4CC} *Format:* `inglizcha = o'zbekcha`\n\n\u{1F4DD} *Ko'p so'z (har qatorga birdan):*\n```\nbook = kitob\nhouse = uy\n```\n\n\u{1F517} *Sinonimlar (vergul bilan):*\n`allow, permit, let = ruxsat`\n\n\u2B07\uFE0F So'zlaringizni yuboring:",
      { replyMarkup: backMenu() }
    );
    return true;
  }
  if (session.userState === "adding") {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    await registerUser(env.DB, uid, firstName || null);
    for (const rawLine of text.trim().split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const pair = splitPair(line);
      if (!pair) continue;
      let [eng, uz] = pair;
      uz = uz.trim().toLowerCase();
      eng = eng.trim().toLowerCase();
      if (!uz || !eng) {
        skipped++;
        continue;
      }
      const r = await addWord(env.DB, uid, uz, eng);
      if (r === "added") added++;
      else if (r === "updated") updated++;
      else skipped++;
    }
    session.userState = null;
    const parts = [];
    if (added) parts.push(`\u2705 *${added} ta* yangi so'z saqlandi`);
    if (updated) parts.push(`\u267B\uFE0F *${updated} ta* so'z yangilandi`);
    if (skipped) parts.push(`\u23ED *${skipped} ta* o'tkazib yuborildi`);
    await sendMessage(env, chatId, "\u{1F4CA} *Natija:*\n" + (parts.join("\n") || "\u26A0\uFE0F Hech narsa saqlanmadi."), {
      replyMarkup: vocabMenu()
    });
    await onWordAdded(env, uid, chatId, added);
    return true;
  }
  if (text === "\u{1F4DD} Test (Yangi)") {
    const words = await wordsNew(env.DB, uid);
    if (words.length === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Yangi so'zlar yo'q!*\n\n\u{1F4A1} *\u2795 So'z qo'shish* orqali yangi so'zlar qo'shing.", {
        replyMarkup: vocabMenu()
      });
      return true;
    }
    const shuffled = shuffle(words);
    session.quizState = {
      words: shuffled.map((w: any) => [w.id, w.uz, w.eng]),
      index: 0,
      correct: 0,
      wrong: [],
      mode: "new"
    };
    await sendMessage(env, chatId, `\u{1F3AF} *Test Boshlandi!*\n\n\u{1F4DA} Jami: *${words.length} ta* yangi so'z\n\u{1F4AA} Muvaffaqiyat!`, { replyMarkup: backMenu() });
    await askQ(env, session, uid, chatId);
    return true;
  }
  if (text === "\u{1F501} Takrorlash") {
    const due = await wordsDue(env.DB, uid);
    if (due.length === 0) {
      const secs = await secondsUntilDue(env.DB, uid);
      if (secs !== null) {
        await sendMessage(
          env,
          chatId,
          `\u23F3 *Hozircha tayyor so'z yo'q.*\n\n\u{1F550} Keyingi takrorlash: *${fmtWait(secs)}dan* so'ng\n\n\u{1F4E6} Quyidagi qutilardan birini tanlab, qolgan aniq vaqtni ko'rishingiz mumkin:`,
          { replyMarkup: await boxMenu(env, uid) }
        );
      } else {
        await sendMessage(
          env,
          chatId,
          "\u{1F4ED} *Takrorlanadigan so'z yo'q.*\n\n\u{1F4A1} Avval *\u{1F4DD} Test (Yangi)* ni ishlatib so'zlarni qutilariga joylashtiring!",
          { replyMarkup: await boxMenu(env, uid) }
        );
      }
      return true;
    }
    await sendMessage(env, chatId, `\u{1F501} *Takrorlash*\n\n\u{1F534} Tayyor so'zlar: *${due.length} ta*\n\n\u{1F4E6} Qutini tanlang:`, {
      replyMarkup: await boxMenu(env, uid)
    });
    return true;
  }
  if (text.includes("\u{1F4E6} Quti")) {
    const match = text.match(/Quti\s+(\d)/);
    if (!match) return true;
    const box = parseInt(match[1], 10);
    const words = await wordsInBox(env.DB, uid, box, true);
    if (words.length === 0) {
      const totalInBox = await countBox(env.DB, uid, box);
      if (totalInBox > 0) {
        const secs = await secondsUntilDueBox(env.DB, uid, box);
        if (secs !== null) {
          await sendMessage(env, chatId, `\u23F3 *Hali vaqt kelmagan.*\n\n\u{1F550} Tayyor bo'ladi: *${fmtWait(secs)}dan* so'ng`, {
            replyMarkup: await boxMenu(env, uid)
          });
        }
      } else {
        await sendMessage(env, chatId, `\u{1F4ED} *Quti ${box}* da so'z yo'q.`, { replyMarkup: await boxMenu(env, uid) });
      }
      return true;
    }
    const shuffled = shuffle(words);
    session.quizState = {
      words: shuffled.map((w: any) => [w.id, w.uz, w.eng]),
      index: 0,
      correct: 0,
      wrong: [],
      mode: `box_${box}`,
      box
    };
    await sendMessage(env, chatId, `\u{1F4E6} *Quti ${box} \u2014 Test*\n\n\u{1F4DA} Jami: *${words.length} ta* so'z\n\u{1F4AA} Davom eting!`, { replyMarkup: backMenu() });
    await askQ(env, session, uid, chatId);
    return true;
  }
  if (text === "\u{1F4CA} Statistika") {
    const s = await stats(env.DB, uid);
    if (s.total === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Statistika yo'q.*\n\n\u{1F4A1} Avval so'z qo'shing!", { replyMarkup: vocabMenu() });
      return true;
    }
    const donePct = s.total ? Math.floor(s.done / s.total * 100) : 0;
    const boxesText = [1, 2, 3, 4, 5].map((i) => `  ${i < 5 ? "\u2523" : "\u2517"} ${BOX_ICON[i]} Quti ${i}: *${s.boxes[i] ?? 0}* ta\n`).join("");
    await sendMessage(
      env,
      chatId,
      `\u{1F4CA} *Statistika*\n\n\u{1F4DA} Jami so'zlar:      *${s.total}* ta\n\u{1F195} Yangi (test yo'q): *${s.new}* ta\n\u{1F534} Bugun takrorlash:  *${s.due}* ta\n\u{1F3C6} Yakunlangan:       *${s.done}* ta\n\n\u{1F4C8} Progress: \`[${bar(s.done, s.total)}]\` *${donePct}%\n\n\u{1F4E6} *Qutilar:*\n${boxesText}`,
      { replyMarkup: vocabMenu() }
    );
    return true;
  }
  if (text === "\u{1F3C6} Yutuqlar") {
    const xp = await getXp(env.DB, uid);
    const [level, xpInLevel, xpSpan] = levelProgress(xp);
    const streak = await getStreak(env.DB, uid);
    const earned = await getBadgeCodes(env.DB, uid);
    const header = `\u{1F3C6} *Yutuqlaringiz*\n\n\u2B50 XP: *${xp}*   \u{1F4C8} Daraja: *${level}*\n\`[${bar(xpInLevel, xpSpan)}]\` ${xpInLevel}/${xpSpan} XP\n\n\u{1F525} Joriy streak: *${streak.current} kun*   \u{1F3C5} Rekord: *${streak.longest} kun*\n\n*Belgilar:*`;
    const lines = Object.entries(BADGES).map(([code, [emoji, title, desc]]) => {
      const mark = earned.has(code) ? "\u2705" : "\u{1F512}";
      return `${mark} ${emoji} *${title}* \u2014 ${desc}`;
    });
    await sendMessage(env, chatId, header + "\n" + lines.join("\n"), { replyMarkup: vocabMenu() });
    return true;
  }
  if (text === "\u{1F3C5} Reyting") {
    const top = await leaderboard(env.DB, 10);
    if (top.length === 0) {
      await sendMessage(env, chatId, "\u{1F4ED} *Reyting hali bo'sh.*", { replyMarkup: vocabMenu() });
      return true;
    }
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    let inTop = false;
    const lines = top.map((u, i) => {
      const rank = i + 1;
      const medal = rank <= 3 ? medals[rank - 1] : `${rank}.`;
      const name = esc(u.first_name) || "Foydalanuvchi";
      const level = xpToLevel(u.xp);
      const marker = u.user_id === uid ? " \u{1F448}" : "";
      if (u.user_id === uid) inTop = true;
      return `${medal} ${name} \u2014 *${u.xp} XP* (Daraja ${level})${marker}`;
    });
    let text2 = "\u{1F3C5} *Reyting \u2014 TOP 10*\n\n" + lines.join("\n");
    if (!inTop) {
      const rank = await userRank(env.DB, uid);
      const myXp = await getXp(env.DB, uid);
      text2 += `\n\n\u{1F4CD} Sizning o'ringiz: *${rank}*-o'rin (${myXp} XP)`;
    }
    await sendMessage(env, chatId, text2, { replyMarkup: vocabMenu() });
    return true;
  }
  if (session.userState === "searching") {
    const q = text.trim();
    if (!q) {
      await sendMessage(env, chatId, "\u26A0\uFE0F So'z kiriting yoki qidiruv so'rovini yuboring.", { replyMarkup: backMenu() });
      return true;
    }
    session.userState = null;
    const words = await searchWords(env.DB, uid, q);
    if (words.length === 0) {
      await sendMessage(env, chatId, `\u{1F4ED} *"${esc(q)}"* topilmadi.\n\n\u{1F4A1} Boshqa so'z bilan qidiring.`, { replyMarkup: vocabMenu() });
      return true;
    }
    await sendWordCards(env, uid, words.slice(0, 20), `\u{1F50D} *"${esc(q)}"* \u2014 ${words.length} ta natija:`);
    await sendMessage(env, chatId, "\u{1F3E0} Lug'at menyusi:", { replyMarkup: vocabMenu() });
    return true;
  }
  const st = session.userState;
  if (st !== null && typeof st === "object" && st.mode === "editing") {
    session.userState = null;
    const raw = text.trim().toLowerCase();
    const cleanedList = parseSynonyms(raw);
    if (cleanedList.length === 0) {
      await sendMessage(env, chatId, "\u26A0\uFE0F Bo'sh qoldirish mumkin emas.", { replyMarkup: vocabMenu() });
      return true;
    }
    const cleaned = cleanedList.join(", ");
    await updateWordEng(env.DB, uid, st.word_id, cleaned);
    await sendMessage(env, chatId, `\u2705 *${esc(st.uz)}* yangilandi!\n\n\u{1F4CC} Yangi tarjima: \`${esc(cleaned)}\``, {
      replyMarkup: vocabMenu()
    });
    return true;
  }
  if (session.quizState) {
    await sendMessage(env, chatId, "\u2753 Iltimos, yuqoridagi tugmalardan birini tanlang.");
    return true;
  }
  
  // Try to match exact menu options; if no match, it's unhandled by vocab
  if (["\u2795 So'z qo'shish", "\u{1F501} Takrorlash", "\u{1F3C6} Yutuqlar", "\u{1F3C5} Reyting", "\u{1F4CA} Statistika", "\u2699\uFE0F Sozlamalar"].includes(text)) {
    return true;
  }

  return false;
}

export async function handleVocabCallback(env: Env, session: Session, cq: TelegramCallbackQuery): Promise<boolean> {
  const message = cq.message;
  if (!message) return false;
  const chatId = message.chat.id;
  const uid = chatId;
  const messageId = message.message_id;
  const data = cq.data ?? "";
  const callbackId = cq.id;
  
  if (data.startsWith("qz_")) {
    const idx = parseInt(data.split("_")[1], 10);
    const quiz = session.quizState;
    if (!quiz || !quiz.currentOptions) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Test tugagan yoki eskirgan.");
      return true;
    }
    const selected = quiz.currentOptions[idx];
    const isCorrect = selected !== undefined && selected.toLowerCase() === quiz.currentCorrect?.toLowerCase();
    const wid = quiz.currentWid;
    const uz = quiz.currentUz;
    if (!wid) return true;
    if (isCorrect) {
      quiz.correct += 1;
      const w = await getWordById(env.DB, uid, wid);
      const oldBox = w ? w.box : 0;
      const newBox = Math.min(oldBox + 1, 5);
      await updateBox(env.DB, uid, wid, newBox);
      const boxTxt = newBox === 5 ? "🏆 *So'z yakunlandi!* Quti 5 ga yetdi!" : `📦 Quti ${oldBox} → ${newBox}`;
      try {
        await editMessageText(env, chatId, messageId, `✅ *To'g'ri!*\n\n🇺🇿 ${(uz || '').toUpperCase()} → 🇬🇧 ${esc(quiz.currentCorrect ?? '')}\n\n${boxTxt}`);
      } catch {}
      await answerCallbackQuery(env, callbackId, "✅ To'g'ri!");
      await onCorrectAnswer(env, uid, chatId, oldBox < 5 && newBox === 5);
    } else {
      quiz.wrong.push([uz ?? '', quiz.currentEng ?? '']);
      await updateBox(env.DB, uid, wid, 1);
      try {
        await editMessageText(env, chatId, messageId, `❌ *Xato!*\n\nSiz tanladingiz: _${esc(selected ?? "")}_\n✔️ To'g'ri javob: *${esc(quiz.currentCorrect ?? '')}*\n\n🇺🇿 ${(uz || '').toUpperCase()} → 🇬🇧 ${esc(quiz.currentCorrect ?? '')}\n📦 → Quti 1 ga qaytarildi`);
      } catch {}
      await answerCallbackQuery(env, callbackId, "\u274C Xato!");
    }
    quiz.index += 1;
    quiz.currentOptions = null;
    quiz.currentCorrect = null;
    quiz.currentWid = null;
    quiz.currentUz = null;
    quiz.currentEng = null;
    await askQ(env, session, uid, chatId);
    return true;
  }
  if (data === "notify_on" || data === "notify_off") {
    const enabled = data === "notify_on";
    await setNotify(env.DB, uid, enabled);
    await answerCallbackQuery(env, callbackId, enabled ? "\u{1F514} Yoqildi!" : "\u{1F515} O'chirildi!");
    try {
      await editMessageText(env, uid, messageId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    } catch {}
    return true;
  }
  if (data === "mode_free" || data === "mode_scheduled") {
    const free = data === "mode_free";
    await setFreeMode(env.DB, uid, free);
    await answerCallbackQuery(env, callbackId, free ? "\u{1F513} Erkin rejim yoqildi!" : "\u23F0 Rejalashtirilgan rejim yoqildi!");
    try {
      await editMessageText(env, uid, messageId, await settingsText(env, uid), { replyMarkup: await settingsKb(env, uid) });
    } catch {}
    return true;
  }
  if (data === "export_words") {
    const words = await getAllWords(env.DB, uid);
    if (words.length === 0) {
      await answerCallbackQuery(env, callbackId, "\u{1F4ED} So'zlar ro'yxati bo'sh.");
      return true;
    }
    words.sort((a, b) => a.uz.localeCompare(b.uz));
    const content = words.map((w: any) => `${w.eng} = ${w.uz}`).join("\n");
    await answerCallbackQuery(env, callbackId, "\u{1F4E4} Eksport qilinmoqda...");
    await sendDocument(env, uid, "sozlar.txt", content, `\u{1F4E4} *${words.length} ta* so'z eksport qilindi.`);
    return true;
  }
  if (data === "settings_all_test") {
    await answerCallbackQuery(env, callbackId);
    await startAllTest(env, session, uid, chatId);
    return true;
  }
  if (data === "settings_words") {
    await answerCallbackQuery(env, callbackId);
    await sendPage(env, uid, uid, 0);
    return true;
  }
  if (data === "settings_search") {
    await answerCallbackQuery(env, callbackId);
    session.userState = "searching";
    await sendMessage(env, uid, "\u{1F50D} *Qidirish*\n\nO'zbek yoki ingliz tilida so'z kiriting:", { replyMarkup: backMenu() });
    return true;
  }
  if (data === "clear_open") {
    const s = await stats(env.DB, uid);
    if (s.total === 0) {
      await answerCallbackQuery(env, callbackId, "\u{1F4ED} O'chiriladigan so'z yo'q.");
      return true;
    }
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, barchasini o'chir", callback_data: "clear_step2" },
        { text: "\u274C Bekor qilish", callback_data: "clear_no" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      `\u26A0\uFE0F *Diqqat!*\n\n*${s.total} ta* so'z butunlay o'chiriladi.\nBu amalni bekor qilib bo'lmaydi!\n\nRostan davom etasizmi?`,
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return true;
  }
  if (data === "clear_step2") {
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, aniq o'chir", callback_data: "clear_yes" },
        { text: "\u274C Bekor qilish", callback_data: "clear_no" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      "\u{1F6A8} *Oxirgi tasdiq!*\n\nBarcha so'zlaringiz *butunlay* o'chiriladi va *hech qanday holatda* (zahira nusxa orqali ham) qaytarib bo'lmaydi.\n\nHaqiqatan ham davom etmoqchimisiz?",
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return true;
  }
  if (data === "clear_yes" || data === "clear_no") {
    if (data === "clear_yes") {
      const count = await deleteAll(env.DB, uid);
      await editMessageText(env, chatId, messageId, `\u{1F5D1} *${count} ta* so'z o'chirildi.`);
      await sendMessage(env, uid, "\u{1F3E0} Lug'at menyusi", { replyMarkup: vocabMenu() });
    } else {
      await editMessageText(env, chatId, messageId, "\u274C Bekor qilindi.", { parseMode: null });
    }
    await answerCallbackQuery(env, callbackId);
    return true;
  }
  if (data.startsWith("page_")) {
    const parts = data.split("_");
    const pg = parseInt(parts[2], 10);
    await answerCallbackQuery(env, callbackId);
    await sendPage(env, uid, chatId, pg);
    return true;
  }
  if (data.startsWith("del_confirm_")) {
    const wid = parseInt(data.split("_")[2], 10);
    const uz = await deleteWord(env.DB, uid, wid);
    if (!uz) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F So'z topilmadi.");
      return true;
    }
    await editMessageText(env, chatId, messageId, `\u{1F5D1} *${esc(uz)}* o'chirildi.`);
    await answerCallbackQuery(env, callbackId, "\u2705 O'chirildi!");
    return true;
  }
  if (data === "del_cancel") {
    await editMessageText(env, chatId, messageId, "\u274C Bekor qilindi.", { parseMode: null });
    await answerCallbackQuery(env, callbackId);
    return true;
  }
  if (data.startsWith("del_")) {
    const wid = parseInt(data.split("_")[1], 10);
    const w = await getWordById(env.DB, uid, wid);
    if (!w) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Topilmadi.");
      return true;
    }
    const kb = inlineKeyboard([
      [
        { text: "\u2705 Ha, o'chir", callback_data: `del_confirm_${wid}` },
        { text: "\u274C Bekor", callback_data: "del_cancel" }
      ]
    ]);
    await editMessageText(
      env,
      chatId,
      messageId,
      `\u26A0\uFE0F *${esc(w.uz)}* \u2192 \`${esc(w.eng)}\`\n\nBu so'z butunlay o'chiriladi va qaytarib bo'lmaydi.\n\nRostan o'chirmoqchimisiz?`,
      { replyMarkup: kb }
    );
    await answerCallbackQuery(env, callbackId);
    return true;
  }
  if (data.startsWith("edit_")) {
    const wid = parseInt(data.split("_")[1], 10);
    const w = await getWordById(env.DB, uid, wid);
    if (!w) {
      await answerCallbackQuery(env, callbackId, "\u26A0\uFE0F Topilmadi.");
      return true;
    }
    session.userState = { mode: "editing", word_id: wid, uz: w.uz };
    await answerCallbackQuery(env, callbackId);
    await sendMessage(
      env,
      uid,
      `\u270F\uFE0F *${esc(w.uz)}* \u2014 tahrirlash\n\n\u{1F4CC} Hozirgi tarjima: \`${esc(w.eng)}\`\n\nYangi tarjimani yozing (sinonimlar vergul bilan):`,
      { replyMarkup: backMenu() }
    );
    return true;
  }
  
  return false;
}
