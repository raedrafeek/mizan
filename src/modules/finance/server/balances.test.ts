import { describe, it, expect } from "vitest";
import { netPositionFromBalances, type AccountBalance } from "./balances";

const base: Omit<AccountBalance, "balanceDefaultMinor" | "isLiability" | "includeInNetWorth"> = {
  accountId: "a",
  balanceMinor: 0,
  currencyCode: "KWD",
  stale: false,
  priceStatus: null,
};

function bal(
  balanceDefaultMinor: number,
  opts: Partial<Pick<AccountBalance, "isLiability" | "includeInNetWorth" | "stale">> = {},
): AccountBalance {
  return {
    ...base,
    balanceDefaultMinor,
    isLiability: opts.isLiability ?? false,
    includeInNetWorth: opts.includeInNetWorth ?? true,
    stale: opts.stale ?? false,
  };
}

describe("netPositionFromBalances", () => {
  it("sums assets and subtracts liabilities", () => {
    const net = netPositionFromBalances([bal(100_000), bal(50_000), bal(-30_000, { isLiability: true })]);
    expect(net.assetsDefaultMinor).toBe(150_000);
    expect(net.liabilitiesDefaultMinor).toBe(30_000);
    expect(net.netDefaultMinor).toBe(120_000);
  });

  it("counts a liability account in credit as an asset", () => {
    const net = netPositionFromBalances([bal(5_000, { isLiability: true })]);
    expect(net.assetsDefaultMinor).toBe(5_000);
    expect(net.liabilitiesDefaultMinor).toBe(0);
  });

  it("treats a negative non-liability balance as a liability", () => {
    const net = netPositionFromBalances([bal(-7_000)]);
    expect(net.assetsDefaultMinor).toBe(0);
    expect(net.liabilitiesDefaultMinor).toBe(7_000);
    expect(net.netDefaultMinor).toBe(-7_000);
  });

  it("skips accounts excluded from net worth entirely", () => {
    const net = netPositionFromBalances([
      bal(100_000),
      bal(999_999, { includeInNetWorth: false, stale: true }),
    ]);
    expect(net.netDefaultMinor).toBe(100_000);
    // an excluded stale account must not flag the whole position stale
    expect(net.anyStale).toBe(false);
  });

  it("propagates staleness from any counted account", () => {
    const net = netPositionFromBalances([bal(100_000), bal(1_000, { stale: true })]);
    expect(net.anyStale).toBe(true);
  });

  it("is zero on no accounts", () => {
    const net = netPositionFromBalances([]);
    expect(net.netDefaultMinor).toBe(0);
    expect(net.anyStale).toBe(false);
  });
});
