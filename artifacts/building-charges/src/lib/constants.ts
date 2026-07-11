export const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

export const STATUS_LABELS = {
  paid: "مدفوع",
  pending: "معلق",
  cancelled: "ملغى"
} as const;

export const TYPE_LABELS = {
  actual: "فعلي",
  forecast: "توقعي"
} as const;

export const ROLE_LABELS = {
  owner: "مالك",
  tenant: "مستأجر"
} as const;
