# 🤖 AllBot — Yagona intizom, odat va lug'at botingiz

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deployed-Cloudflare%20Workers-orange?logo=cloudflare)](https://myallbots.xursanalime.workers.dev)
[![Bot](https://img.shields.io/badge/Telegram-@Cloudchibot-blue?logo=telegram)](https://t.me/Cloudchibot)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **Telegram**: [@Cloudchibot](https://t.me/Cloudchibot)  
> **Ishlab chiquvchi**: [@xursanalime](https://github.com/xursanalime)  
> **Platforma**: Cloudflare Workers + D1 Database

---

## 📖 Loyiha haqida

**AllBot** — bu uchta kuchli modulni birlashtirgan yagona Telegram boti:

| Modul | Tavsif |
|-------|--------|
| 📋 **Odatlar (Habits)** | Kunlik odat yaratish, kuzatish, eslatmalar va If-Then rejasi |
| 📚 **Lug'at (BrainBridge)** | Leitner tizimidagi so'z kartalari va XP gamifikatsiya tizimi |
| 🤖 **AI Yordamchi** | Google Gemini 3.7 Flash bilan to'liq integratsiyalashgan shaxsiy AI maslahatchi |

---

## ✨ Asosiy imkoniyatlar

### 📋 Odatlar moduli
- Yangi odat qo'shish (nom, eslatma vaqti, minimum versiya, If-Then rejasi)
- Bugungi vazifalar ro'yxati va holati (`✅ Bajarildi / 🟡 Minimum / ⏭ O'tkazish / ⏰ Keyinroq`)
- Kunlik ball va streak (uzluksizlik) hisobi
- Avtomatik tonggi (07:00) va kechki (22:00) eslatmalar
- Individual odat uchun o'z vaqtida eslatma

### 📚 Lug'at moduli (BrainBridge)
- **Leitner tizimi**: 5 qutili Spaced Repetition algoritmi
  - Quti 1: 4 soat, Quti 2: 24 soat, Quti 3: 72 soat, Quti 4: 7 kun, Quti 5: 14 kun
- Multiple choice test (4 variant)
- **Gamifikatsiya**: XP, darajalar, nishonlar (badges), reyting jadvali
- Sinonimlar qo'llab-quvvatlash: `allow, permit, let = ruxsat`
- So'z qidirish
- Haftalik xulosa va re-engagement eslatmalari

### 🤖 AI Yordamchi
- **Model**: Google Gemini 3.7 Flash (OpenRouter orqali)
- Foydalanuvchining **real** ma'lumotlari bilan integratsiya:
  - Barcha so'zlar, qutilardagi taqsimot, XP, streak
  - Faol odatlar va bugungi bajarilish holati
  - So'nggi 7 kunlik kundalik natijalar
- Erkin savol-javob rejimi
- Kechki AI tahlil va maslahat

---

## 🏗️ Texnik arxitektura

```
allbot/
├── src/
│   ├── index.ts           # Cloudflare Worker entry point
│   ├── router.ts          # Telegram update routeri
│   ├── menu.ts            # Asosiy menyu
│   ├── types.ts           # TypeScript interfeyslari
│   ├── telegram.ts        # Telegram Bot API wrapper
│   ├── ai/
│   │   ├── analysis.ts    # AI kontekst va prompt generatori
│   │   ├── handlers.ts    # AI chat handleri
│   │   └── openrouter.ts  # OpenRouter API client
│   ├── habits/
│   │   ├── db.ts          # Odatlar DB so'rovlari
│   │   ├── handlers.ts    # Odatlar message/callback handlerlari
│   │   ├── reminders.ts   # Scheduled bildirishnomalar
│   │   └── stats.ts       # Odatlar statistikasi
│   └── vocab/
│       ├── db.ts          # Lug'at DB so'rovlari
│       ├── gamification.ts # XP, nishonlar, darajalar
│       ├── handlers.ts    # Lug'at message/callback handlerlari
│       └── notifier.ts    # Lug'at bildirishnomalari
├── wrangler.toml          # Cloudflare konfiguratsiyasi
├── tsconfig.json
└── package.json
```

---

## 🛠️ Texnologiyalar

| Texnologiya | Maqsad |
|------------|--------|
| **Cloudflare Workers** | Serverless runtime (0ms cold start) |
| **Cloudflare D1** | SQLite-based serverless database |
| **Cloudflare Cron Triggers** | Har 5 daqiqada scheduled checks |
| **TypeScript 5.6** | Type-safe kod yozish |
| **Wrangler 3** | CLI va deployment tool |
| **OpenRouter API** | AI model gateway |
| **Google Gemini 3.7 Flash** | AI model (tez va arzon) |
| **Telegram Bot API** | Webhook orqali xabarlar |

---

## ⚙️ O'rnatish va deploy

### Talablar
- Node.js 18+
- Cloudflare akkount
- Telegram bot token ([@BotFather](https://t.me/BotFather) orqali)
- OpenRouter API kalit ([openrouter.ai](https://openrouter.ai))

### 1. Klonlash

```bash
git clone https://github.com/xursanalime/myallbots.git
cd myallbots/allbot
npm install
```

### 2. D1 bazasini yaratish

```bash
npx wrangler d1 create allbot-db
```

`wrangler.toml` ga qaytgan `database_id` ni kiriting.

### 3. Maxfiy kalitlarni o'rnatish

```bash
printf "BOT_TOKEN_QIYMAT" | npx wrangler secret put BOT_TOKEN
printf "WEBHOOK_SECRET_QIYMAT" | npx wrangler secret put WEBHOOK_SECRET
printf "sk-or-..." | npx wrangler secret put OPENROUTER_API_KEY
```

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Webhook ulash

```
https://your-worker.workers.dev/set-webhook?secret=WEBHOOK_SECRET_QIYMAT
```

---

## 🗄️ Ma'lumotlar bazasi sxemasi

```sql
users          -- Foydalanuvchilar, XP, streak, sozlamalar
words          -- Lug'at so'zlari (Leitner qutilar bilan)
badges         -- Qo'lga kiritilgan nishonlar
bot_sessions   -- Foydalanuvchi holati (state machine)
habits         -- Faol odatlar
habit_logs     -- Kunlik odat bajarilish holati
daily_scores   -- Kunlik ball va streak hisob-kitobi
```

---

## 📡 Bildirishnomalar tizimi

Har **5 daqiqada** Cloudflare Cron orqali quyidagilar tekshiriladi:

| Vaqt | Bildirishnoma |
|------|---------------|
| 07:00–11:00 | 🌅 Tonggi salom + bugungi vazifalar soni |
| Kundalik vaqt | ⏰ Individual odat eslatmasi (har odat uchun 1 marta/kun) |
| 21:30+ | 🌙 Kechki xulosa + bajarilmagan odatlar ro'yxati |
| 22:00+ | 📢 Telegram kanalga kunlik hisobot (Odatlar, Lug'at, Streak, AI xulosa) |
| Kun davomida | 📚 Takrorlash vaqti kelgan so'zlar eslatmasi (4 soatda 1 marta) |
| 20:00+ | 🔥 Streak yo'qolish xavfi ogohlantirishsi |
| 3 kun faolsizlik | 👋 Re-engagement xabari |
| Dushanba | 📅 Haftalik xulosa |

---

### 📢 Kanalga kunlik hisobot ulash (22:00)

Bot kunlik intizom, odatlar, lug'at natijalari va AI sharhini shaxsiy Telegram kanalingizga (masalan, rivojlanish blogingizga) avtomatik joylab boradi:

1. Botni (@Cloudchibot) kanalingizga **Administrator** qilib qo'shing (xabar yozish huquqini bering).
2. Kanalingizdan istalgan xabarni botga **Forward** qiling (bot avtomatik taniydi va ulaydi).
   * Yoki botga `/setchannel @kanal_nomi` (yoki `-100...` ID) buyrug'ini yuboring.
3. Bot `⚙️ Sozlamalar -> 📡 Hisobot kanali` bo'limida ham to'liq boshqariladi.
4. Kanalga darhol sinov hisobotini yuborib ko'rish uchun: `/testreport` buyrug'ini bering.

---

## 🔗 Foydali havolalar

- **Bot**: [@Cloudchibot](https://t.me/Cloudchibot)
- **GitHub**: [xursanalime/myallbots](https://github.com/xursanalime/myallbots)
- **Worker URL**: [myallbots.xursanalime.workers.dev](https://myallbots.xursanalime.workers.dev)

---

## 📄 Litsenziya

MIT License — erkin foydalaning, fork qiling, yaxshilang!

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/xursanalime">xursanalime</a>
  <br/>
  Powered by Cloudflare Workers + Google Gemini 3.7 Flash
</div>
