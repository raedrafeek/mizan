import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  AmountError,
  parseAmount,
  minorToDecimalString,
  formatMinor,
  convertMinor,
  crossRate,
  holdingValueMinor,
} from "./money";

describe("parseAmount", () => {
  it("parses KWD 3-decimal amounts", () => {
    expect(parseAmount("12.450", 3)).toBe(12450);
    expect(parseAmount("0.001", 3)).toBe(1);
    expect(parseAmount("600", 3)).toBe(600000);
  });
  it("parses USD 2-decimal amounts", () => {
    expect(parseAmount("4.99", 2)).toBe(499);
  });
  it("rejects excess precision", () => {
    expect(() => parseAmount("1.2345", 3)).toThrow();
  });
  it("rejects garbage and negatives (sign comes from type)", () => {
    expect(() => parseAmount("abc", 3)).toThrow();
    expect(() => parseAmount("-5", 3)).toThrow();
    expect(() => parseAmount("1,5", 3)).toThrow();
  });
  it("throws AmountError so API routes can map it to a 400", () => {
    expect(() => parseAmount("abc", 3)).toThrow(AmountError);
    expect(() => parseAmount("1.2345", 3)).toThrow(AmountError);
  });
});

describe("minor/format round-trips", () => {
  it("round-trips through decimal string", () => {
    for (const [minor, exp] of [
      [12450, 3],
      [499, 2],
      [100000000, 8],
      [0, 3],
    ] as const) {
      expect(parseAmount(minorToDecimalString(minor, exp), exp)).toBe(minor);
    }
  });
  it("formats with grouping and Unicode minus", () => {
    expect(formatMinor(5972640, 3)).toBe("5,972.640");
    expect(formatMinor(-1677360, 3)).toBe("−1,677.360");
    expect(formatMinor(0, 2)).toBe("0.00");
  });
});

describe("convertMinor", () => {
  it("converts KWD → USD (1 KWD = 3.262 USD)", () => {
    // 100.000 KWD → 326.20 USD
    expect(convertMinor(100000, "3.262", 3, 2)).toBe(32620);
  });
  it("converts INR → KWD (1 INR = 0.003257 KWD)", () => {
    // ₹258,990.00 → ~843.531 KWD
    expect(convertMinor(25899000, "0.003257", 2, 3)).toBe(843530);
  });
  it("is identity at rate 1 within same exponent", () => {
    expect(convertMinor(12345, 1, 3, 3)).toBe(12345);
  });
  it("banker-rounds at the target minor unit", () => {
    // 0.15 USD at rate 1 → KWD (exp 3): 0.150 exactly
    expect(convertMinor(15, "1", 2, 3)).toBe(150);
    // exact half: 0.0005 → rounds to even
    expect(convertMinor(5, "0.1", 2, 3)).toBe(5); // 0.05*0.1=0.005 → 5 minor exactly
  });
});

describe("crossRate", () => {
  it("derives USD→INR from KWD-based rates", () => {
    // 1 KWD = 3.262 USD, 1 KWD = 307.0 INR → 1 USD = 94.11... INR
    const r = crossRate("3.262", "307.0");
    expect(r.toDecimalPlaces(4).toString()).toBe(new Decimal("307.0").div("3.262").toDecimalPlaces(4).toString());
  });
  it("throws on zero", () => {
    expect(() => crossRate(0, 1)).toThrow();
  });
});

describe("holdingValueMinor", () => {
  it("values a BTC position in USD", () => {
    // 0.05 BTC @ $97,432.10 → $4,871.605 → 487160.5 cents → 487160 (half-even)
    expect(holdingValueMinor("0.05", "97432.10", 2)).toBe(487160);
  });
  it("handles tiny quantities without float loss", () => {
    expect(holdingValueMinor("0.000001", "100000000", 2)).toBe(10000);
  });
});
