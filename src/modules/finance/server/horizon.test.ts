import { describe, it, expect } from "vitest";
import { nextDueDate } from "./horizon";

describe("nextDueDate", () => {
  it("advances a month within the year", () => {
    expect(nextDueDate("2026-03-15", "monthly")).toBe("2026-04-15");
  });

  it("rolls over the year boundary", () => {
    expect(nextDueDate("2026-12-05", "monthly")).toBe("2027-01-05");
  });

  it("clamps day-31 to the target month's end instead of drifting", () => {
    // naive setUTCMonth turned Jan 31 into Mar 3 and the bill drifted forever
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDueDate("2026-03-31", "monthly")).toBe("2026-04-30");
  });

  it("clamps into a leap February correctly", () => {
    expect(nextDueDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("advances a year for yearly items", () => {
    expect(nextDueDate("2026-07-01", "yearly")).toBe("2027-07-01");
  });

  it("clamps yearly Feb-29 to Feb-28 in non-leap years", () => {
    expect(nextDueDate("2028-02-29", "yearly")).toBe("2029-02-28");
  });
});
