import Decimal from "decimal.js";

/**
 * All monetary amounts are stored/passed as integer minor units
 * (KWD exponent 3 → 1.250 KD = 1250; USD exponent 2 → $4.99 = 499).
 * Floats never touch amounts; Decimal.js is used only at FX boundaries.
 */

export interface CurrencyInfo {
  code: string;
  exponent: number;
  symbol: string;
}

/** Bad user-entered amount — API routes map this to a 400, not a 500. */
export class AmountError extends Error {}

/** Parse a user-entered decimal string ("12.450") into minor units. Throws on bad input. */
export function parseAmount(input: string, exponent: number): number {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AmountError(`Invalid amount: "${input}"`);
  }
  const d = new Decimal(trimmed).mul(new Decimal(10).pow(exponent));
  if (!d.isInteger()) {
    throw new AmountError(`Amount "${input}" has more than ${exponent} decimal places`);
  }
  if (d.gt(Number.MAX_SAFE_INTEGER)) throw new AmountError("Amount too large");
  return d.toNumber();
}

/** Minor units → decimal string with the currency's full precision ("1250", 3 → "1.250"). */
export function minorToDecimalString(minor: number | bigint, exponent: number): string {
  return new Decimal(minor.toString()).div(new Decimal(10).pow(exponent)).toFixed(exponent);
}

/** Format minor units for display with thousands separators: 5972640 KWD → "5,972.640". */
export function formatMinor(minor: number | bigint, exponent: number): string {
  const neg = BigInt(minor) < 0n;
  const abs = neg ? -BigInt(minor) : BigInt(minor);
  const s = minorToDecimalString(abs, exponent);
  const [int, frac] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac !== undefined ? `${grouped}.${frac}` : grouped;
  // U+2212 minus sign, matching the mockup
  return neg ? `−${body}` : body;
}

/**
 * Convert an amount between currencies at a given rate.
 * `rate` is: 1 unit of `from` = `rate` units of `to` (major units both sides).
 * Rounds half-even to the target currency's minor unit.
 */
export function convertMinor(
  amountMinor: number | bigint,
  rate: Decimal.Value,
  fromExponent: number,
  toExponent: number,
): number {
  const major = new Decimal(amountMinor.toString()).div(new Decimal(10).pow(fromExponent));
  const converted = major.mul(rate);
  return converted
    .mul(new Decimal(10).pow(toExponent))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

/**
 * Cross-rate helper. Given rates quoted against a base currency
 * (1 BASE = rateBaseToX X), returns the rate 1 FROM = ? TO.
 */
export function crossRate(rateBaseToFrom: Decimal.Value, rateBaseToTo: Decimal.Value): Decimal {
  const from = new Decimal(rateBaseToFrom);
  if (from.isZero()) throw new Error("crossRate: zero rate");
  return new Decimal(rateBaseToTo).div(from);
}

/** Signed amount in minor units for a transaction type (expense negative, income positive). */
export function signedMinor(
  type: "expense" | "income" | "transfer_out" | "transfer_in" | "adjustment",
  amountMinor: number | bigint,
  adjustmentSign: 1 | -1 = 1,
): bigint {
  const abs = BigInt(amountMinor) < 0n ? -BigInt(amountMinor) : BigInt(amountMinor);
  switch (type) {
    case "expense":
    case "transfer_out":
      return -abs;
    case "income":
    case "transfer_in":
      return abs;
    case "adjustment":
      return adjustmentSign === -1 ? -abs : abs;
  }
}

/** Value of a priced holding: quantity × price (major) → minor units of the price currency. */
export function holdingValueMinor(
  quantity: Decimal.Value,
  priceMajor: Decimal.Value,
  priceExponent: number,
): number {
  return new Decimal(quantity)
    .mul(priceMajor)
    .mul(new Decimal(10).pow(priceExponent))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}
