/**
 * Prisma returns BigInt for *_minor columns and Decimal for rates/quantities.
 * JSON.stringify chokes on BigInt, so API routes serialize through this helper.
 * Minor-unit amounts fit comfortably in Number (< 2^53) for personal finance scale.
 */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return Number(v);
      // Prisma Decimal serializes via toJSON to string already
      return v;
    }),
  );
}
