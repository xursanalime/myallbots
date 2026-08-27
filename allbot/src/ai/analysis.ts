import { chatCompletion } from './openrouter';

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-latest';
const WEEKLY_MODEL = 'deepseek/deepseek-v4-flash-latest';

export async function generateDailyAnalysis(
  apiKey: string,
  userName: string,
  journalData: Record<string, any>[]
): Promise<string | null> {
  const systemPrompt = "Sen o'zbek tilidagi shaxsiy intizom va odat yordamchisisansan. Foydalanuvchining kunlik jurnal ma'lumotlari asosida 2-3 gaplik qisqa, shaxsiy sharh yoz. Faqat real ma'lumotlarga asoslan, o'ylab topma. Ohang: samimiy, qo'llab-quvvatlovchi, bosim qilmaydigan.";
  const userMessage = `Foydalanuvchi: ${userName}\nOxirgi 7 kunlik jurnallar:\n${JSON.stringify(journalData, null, 2)}`;
  
  return chatCompletion(apiKey, DEFAULT_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], 300);
}

export async function generateWeeklyReport(
  apiKey: string,
  userName: string,
  journalData: Record<string, any>[],
  stats: Record<string, any>
): Promise<string | null> {
  const systemPrompt = "Sen intizom va odat bo'yicha haftalik tahlil yozuvchisissan. 7 kunlik ma'lumotlar asosida: 1) Nima yaxshi ishladi, 2) Nima to'siq bo'ldi, 3) Keyingi haftaga bitta aniq tavsiya. O'zbek tilida, 4-6 gap.";
  const userMessage = `Foydalanuvchi: ${userName}\nJurnallar:\n${JSON.stringify(journalData, null, 2)}\nStatistika:\n${JSON.stringify(stats, null, 2)}`;
  
  return chatCompletion(apiKey, WEEKLY_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], 500);
}

export async function generateFreeResponse(
  apiKey: string,
  userName: string,
  question: string,
  journalData: Record<string, any>[],
  stats: Record<string, any>
): Promise<string | null> {
  const systemPrompt = "Sen o'zbek tilidagi yordamchi botsan. Foydalanuvchiga uning odatlari, yutuqlari yoki bergan savollariga asoslanib yordam berasan. Foydalanuvchi haqidagi faktlardan foydalan. Qisqa va lo'nda javob ber.";
  const userMessage = `Foydalanuvchi: ${userName}\nSavol: ${question}\nJurnallar: ${JSON.stringify(journalData)}\nStatistika: ${JSON.stringify(stats)}`;
  
  return chatCompletion(apiKey, DEFAULT_MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], 600);
}
