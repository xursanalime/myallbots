import { Env } from '../types';
import { sendMessage } from '../telegram';
import { getXp, addXp, bumpStreak, awardBadge, countWords, countBox } from './db';

export const XP_CORRECT = 10;
export const XP_WORD_ADDED = 2;
export const XP_BOX5_BONUS = 25;
export const XP_PERFECT_TEST_BONUS = 15;
export const PERFECT_TEST_MIN_TOTAL = 3;
export const STREAK_BONUS_XP: Record<number, number> = { 3: 20, 7: 50, 14: 100, 30: 200, 60: 350, 100: 500 };
export const LEVEL_XP_BASE = 50;

export const BADGES: Record<string, [string, string, string]> = {
  words_1: ["\u{1F331}", "Birinchi qadam", "1-so'zingizni qo'shdingiz"],
  words_10: ["\u{1F4D7}", "Boshlovchi", "10 ta so'z qo'shdingiz"],
  words_50: ["\u{1F4D8}", "Ishtiyoqli", "50 ta so'z qo'shdingiz"],
  words_100: ["\u{1F4DA}", "Lug'atchi", "100 ta so'z qo'shdingiz"],
  master_1: ["\u{1F3C6}", "Birinchi g'alaba", "1-so'zni to'liq o'zlashtirdingiz (Quti 5)"],
  master_10: ["\u{1F451}", "Usta", "10 ta so'zni to'liq o'zlashtirdingiz"],
  streak_3: ["\u{1F525}", "Qizigan", "3 kunlik streak"],
  streak_7: ["\u{1F525}", "Bir hafta", "7 kunlik streak"],
  streak_14: ["\u{1F525}", "Ikki hafta", "14 kunlik streak"],
  streak_30: ["\u{1F48E}", "Bir oy", "30 kunlik streak"],
  streak_100: ["\u{1F31F}", "Afsonaviy", "100 kunlik streak"],
  perfect_test: ["\u{1F4AF}", "Mukammal", "Testni 100% to'g'ri yakunladingiz"]
};

export const WORD_COUNT_BADGES: [number, string][] = [
  [1, "words_1"],
  [10, "words_10"],
  [50, "words_50"],
  [100, "words_100"]
];

export const MASTER_BADGES: [number, string][] = [
  [1, "master_1"],
  [10, "master_10"]
];

export const STREAK_BADGES: [number, string][] = [
  [3, "streak_3"],
  [7, "streak_7"],
  [14, "streak_14"],
  [30, "streak_30"],
  [100, "streak_100"]
];

export function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / LEVEL_XP_BASE)) + 1;
}

export function levelProgress(xp: number): [number, number, number] {
  xp = Math.max(xp, 0);
  const level = xpToLevel(xp);
  const floorXp = LEVEL_XP_BASE * ((level - 1) ** 2);
  const nextXp = LEVEL_XP_BASE * (level ** 2);
  return [level, xp - floorXp, nextXp - floorXp];
}

export async function grantXp(env: Env, uid: number, chatId: number, amount: number): Promise<void> {
  if (amount <= 0) return;
  const oldLevel = xpToLevel(await getXp(env.DB, uid));
  await addXp(env.DB, uid, amount);
  const newLevel = xpToLevel(await getXp(env.DB, uid));
  if (newLevel > oldLevel) {
    await sendMessage(env, chatId, `\u{1F389} *Tabriklaymiz! Siz ${newLevel}-darajaga yetdingiz!*`);
  }
}

export async function checkBadges(env: Env, uid: number, thresholds: [number, string][], currentValue: number): Promise<string[]> {
  const newly: string[] = [];
  for (const [threshold, code] of thresholds) {
    if (currentValue >= threshold && await awardBadge(env.DB, uid, code)) {
      newly.push(code);
    }
  }
  return newly;
}

export async function announceBadges(env: Env, chatId: number, codes: string[]): Promise<void> {
  for (const code of codes) {
    const [emoji, title, desc] = BADGES[code];
    await sendMessage(env, chatId, `${emoji} *Yangi yutuq: ${title}!*\n_${desc}_`);
  }
}

export async function recordActivity(env: Env, uid: number, chatId: number): Promise<void> {
  const res = await bumpStreak(env.DB, uid);
  if (!res.changed) return;
  const newly = await checkBadges(env, uid, STREAK_BADGES, res.streak);
  for (const code of newly) {
    const threshold = parseInt(code.split("_")[1], 10);
    const bonus = STREAK_BONUS_XP[threshold] || 0;
    const [emoji, title, desc] = BADGES[code];
    let text = `${emoji} *Yangi yutuq: ${title}!*\n_${desc}_`;
    if (bonus) {
      await grantXp(env, uid, chatId, bonus);
      text += `\n\u2B50 +${bonus} XP bonus!`;
    }
    await sendMessage(env, chatId, text);
  }
}

export async function onWordAdded(env: Env, uid: number, chatId: number, addedCount: number): Promise<void> {
  if (addedCount <= 0) return;
  await grantXp(env, uid, chatId, XP_WORD_ADDED * addedCount);
  const newly = await checkBadges(env, uid, WORD_COUNT_BADGES, await countWords(env.DB, uid));
  await announceBadges(env, chatId, newly);
}

export async function onCorrectAnswer(env: Env, uid: number, chatId: number, reachedBox5: boolean): Promise<number> {
  const xp = XP_CORRECT + (reachedBox5 ? XP_BOX5_BONUS : 0);
  await grantXp(env, uid, chatId, xp);
  await sendMessage(env, chatId, `\u2B50 +${xp} XP`);
  if (reachedBox5) {
    const newly = await checkBadges(env, uid, MASTER_BADGES, await countBox(env.DB, uid, 5));
    await announceBadges(env, chatId, newly);
  }
  await recordActivity(env, uid, chatId);
  return xp;
}

export async function onTestFinished(env: Env, uid: number, chatId: number, pct: number, total: number): Promise<void> {
  if (pct === 100 && total >= PERFECT_TEST_MIN_TOTAL) {
    await grantXp(env, uid, chatId, XP_PERFECT_TEST_BONUS);
    await sendMessage(env, chatId, `\u{1F4AF} Mukammal test bonusi: +${XP_PERFECT_TEST_BONUS} XP`);
    if (await awardBadge(env.DB, uid, "perfect_test")) {
      await announceBadges(env, chatId, ["perfect_test"]);
    }
  }
}
