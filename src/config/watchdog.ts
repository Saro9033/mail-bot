export const WATCHDOG_TYPES = [
  'Product or Service Inquiry',
  'Pricing and Quote Request',
  'Collaboration or Partnership',
  'LinkedIn Message',
] as const;

export type WatchdogType = (typeof WATCHDOG_TYPES)[number];

export function isWatchdogType(value: string): value is WatchdogType {
  return WATCHDOG_TYPES.some((type) => type.toLowerCase() === value.trim().toLowerCase());
}

export function normalizeWatchdogType(value: string): WatchdogType | null {
  const match = WATCHDOG_TYPES.find((type) => type.toLowerCase() === value.trim().toLowerCase());
  return match ?? null;
}
