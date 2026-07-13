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
