// Habit weekday schedule.
// Days are stored in habits.schedule_days as a comma-separated list using SQLite's
// strftime('%w') numbering (0 = Sunday ... 6 = Saturday). NULL means "every day".

// Display order is Monday-first; values follow the %w numbering.
export const WEEK_DAYS: Array<{ value: number; short: string; full: string }> = [
  { value: 1, short: 'Du', full: 'Dushanba' },
  { value: 2, short: 'Se', full: 'Seshanba' },
  { value: 3, short: 'Chor', full: 'Chorshanba' },
  { value: 4, short: 'Pay', full: 'Payshanba' },
  { value: 5, short: 'Ju', full: 'Juma' },
  { value: 6, short: 'Sha', full: 'Shanba' },
  { value: 0, short: 'Yak', full: 'Yakshanba' }
];

export const DAY_PRESETS: Record<string, { label: string; days: number[] }> = {
  all: { label: 'Har kuni', days: [0, 1, 2, 3, 4, 5, 6] },
  weekdays: { label: 'Du–Ju', days: [1, 2, 3, 4, 5] },
  mwf: { label: 'Du-Chor-Ju', days: [1, 3, 5] },
  tts: { label: 'Se-Pay-Sha', days: [2, 4, 6] },
  weekend: { label: 'Dam olish', days: [6, 0] }
};

// SQL condition: habit alias `h` is scheduled on the date bound to the `?` placeholder.
export const SCHEDULED_ON_SQL =
  `(h.schedule_days IS NULL OR h.schedule_days = '' OR instr(',' || h.schedule_days || ',', ',' || strftime('%w', ?) || ',') > 0)`;

export function parseScheduleDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const days = raw.split(',').map(s => parseInt(s, 10)).filter(n => n >= 0 && n <= 6);
  return days.length > 0 && days.length < 7 ? days : null;
}

// Normalizes a day selection for storage: null when the habit runs every day.
export function serializeScheduleDays(days: number[] | null | undefined): string | null {
  if (!days) return null;
  const unique = Array.from(new Set(days.filter(d => d >= 0 && d <= 6)));
  if (unique.length === 0 || unique.length === 7) return null;
  return WEEK_DAYS.map(d => d.value).filter(v => unique.includes(v)).join(',');
}

export function formatSchedule(raw: string | null | undefined): string {
  const days = parseScheduleDays(raw);
  if (!days) return 'Har kuni';
  return WEEK_DAYS.filter(d => days.includes(d.value)).map(d => d.short).join(', ');
}

export function dayPickerKeyboard(selected: number[]): { text: string; callback_data: string }[][] {
  const dayButtons = WEEK_DAYS.map(d => ({
    text: `${selected.includes(d.value) ? '✅' : '⬜'} ${d.short}`,
    callback_data: `h_day:${d.value}`
  }));
  return [
    dayButtons.slice(0, 4),
    dayButtons.slice(4),
    [
      { text: DAY_PRESETS.all.label, callback_data: 'h_days_preset:all' },
      { text: DAY_PRESETS.weekdays.label, callback_data: 'h_days_preset:weekdays' }
    ],
    [
      { text: DAY_PRESETS.mwf.label, callback_data: 'h_days_preset:mwf' },
      { text: DAY_PRESETS.tts.label, callback_data: 'h_days_preset:tts' },
      { text: DAY_PRESETS.weekend.label, callback_data: 'h_days_preset:weekend' }
    ],
    [{ text: '➡️ Tayyor', callback_data: 'h_days_ok' }]
  ];
}

export function dayPickerText(selected: number[]): string {
  const summary = selected.length === 0 ? '_hali tanlanmagan_' : `*${formatSchedule(serializeScheduleDays(selected))}*`;
  return `📅 Odat qaysi kunlari bajariladi?\n\nKunlarni bosib tanlang yoki tayyor variantlardan birini tanlang.\n` +
    `(Masalan, haftada 3 marta: *Du-Chor-Ju*)\n\nTanlangan: ${summary}`;
}
