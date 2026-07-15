import { formatMinor } from "./money";
import type { CurrencyDto } from "@/modules/finance/types";

export function fmt(minor: number, currency: Pick<CurrencyDto, "exponent">): string {
  return formatMinor(minor, currency.exponent);
}

export function fmtWithCode(
  minor: number,
  currency: Pick<CurrencyDto, "exponent" | "code">,
): string {
  return `${formatMinor(minor, currency.exponent)} ${currency.code}`;
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** "2026-07-14" → "Today" / "Yesterday" / "14 Jul" / "14 Jul 25" (other year). */
export function humanDay(dateISO: string): string {
  const today = todayISO();
  if (dateISO === today) return "Today";
  const yesterday = new Date(new Date(today + "T00:00:00Z").getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (dateISO === yesterday) return "Yesterday";
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: dateISO.slice(0, 4) === today.slice(0, 4) ? undefined : "2-digit",
  });
}
