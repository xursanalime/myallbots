// Pronunciation audio (mp3) for an English word, tried from several free TTS sources in order.
const SOURCES: Array<(q: string) => string> = [
  q => `https://translate.google.com/translate_tts?ie=UTF-8&q=${q}&tl=en&client=tw-ob`,
  q => `https://dict.youdao.com/dictvoice?audio=${q}&type=2`
];

const MAX_TEXT_LENGTH = 100;
const FETCH_TIMEOUT_MS = 8000;

export async function fetchPronunciation(text: string): Promise<ArrayBuffer | null> {
  const q = encodeURIComponent(text.trim().slice(0, MAX_TEXT_LENGTH));
  if (!q) return null;

  for (const source of SOURCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(source(q), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AllBot/1.0)' },
        signal: controller.signal
      });
      if (!res.ok || !(res.headers.get('content-type') || '').toLowerCase().startsWith('audio')) continue;
      const audio = await res.arrayBuffer();
      if (audio.byteLength > 0) return audio;
    } catch {
      // try the next source
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
