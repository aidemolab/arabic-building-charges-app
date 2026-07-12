const DAY_MS = 1000 * 60 * 60 * 24;

export const PASSWORD_MAX_AGE_DAYS =
  Number(import.meta.env.VITE_PASSWORD_MAX_AGE_DAYS) || 90;

export function passwordAgeDays(lastChanged: string | null | undefined): number | null {
  if (!lastChanged) return null;
  const ts = new Date(lastChanged).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / DAY_MS);
}

export function isPasswordOverdue(lastChanged: string | null | undefined): boolean {
  const days = passwordAgeDays(lastChanged);
  return days !== null && days >= PASSWORD_MAX_AGE_DAYS;
}
