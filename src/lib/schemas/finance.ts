import { z } from "zod";

export const accountKinds = ["transactional", "priced"] as const;
export const accountSubtypes = [
  "bank",
  "cash",
  "credit_card",
  "crypto",
  "stock",
  "loan",
  "other",
] as const;
export const priceSources = ["coingecko", "finnhub", "manual"] as const;
export const transactionTypes = [
  "expense",
  "income",
  "transfer_out",
  "transfer_in",
  "adjustment",
] as const;

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive decimal number");

export const accountCreateSchema = z
  .object({
    name: z.string().min(1).max(80),
    kind: z.enum(accountKinds),
    subtype: z.enum(accountSubtypes),
    currencyCode: z.string().min(3).max(4),
    isLiability: z.boolean().default(false),
    includeInNetWorth: z.boolean().default(true),
    openingBalance: decimalString.optional(), // major units, converted server-side
    assetSymbol: z.string().max(60).optional(),
    quantity: decimalString.optional(),
    priceSource: z.enum(priceSources).optional(),
    manualPrice: decimalString.optional(),
    icon: z.string().max(30).default("bank"),
    mask: z.string().max(30).optional(),
    sortOrder: z.number().int().default(0),
  })
  .refine((a) => a.kind !== "priced" || (a.assetSymbol && a.priceSource) || a.manualPrice, {
    message: "Priced accounts need an asset symbol + price source, or a manual price",
  });

export const accountUpdateSchema = accountCreateSchema.innerType().partial().extend({
  archived: z.boolean().optional(),
});

export const transactionCreateSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(transactionTypes),
  amount: decimalString, // major units in the account currency, always positive
  categoryId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  // transfers: the counterparty account; server creates both legs
  counterAccountId: z.string().optional(),
  // optional manual FX override (1 unit account currency = rate default currency)
  fxRateToDefault: decimalString.optional(),
});

export const transactionUpdateSchema = z.object({
  amount: decimalString.optional(),
  categoryId: z.string().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(500).nullable().optional(),
  fxRateToDefault: decimalString.optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(80),
  target: decimalString, // major units, default currency
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  linkedAccountId: z.string().optional(),
  manualProgress: decimalString.optional(),
});

export const campaignUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  target: decimalString.optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  linkedAccountId: z.string().nullable().optional(),
  manualProgress: decimalString.nullable().optional(),
  status: z.enum(["active", "paused", "done", "abandoned"]).optional(),
});

export const scheduledItemCreateSchema = z.object({
  name: z.string().min(1).max(120),
  direction: z.enum(["inflow", "outflow"]),
  amount: decimalString, // major units in currencyCode
  currencyCode: z.string().min(3).max(4),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recurrence: z.enum(["monthly", "yearly"]).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  alertDaysBefore: z.number().int().min(0).max(365).default(7),
});

export const scheduledItemUpdateSchema = scheduledItemCreateSchema.partial().extend({
  status: z.enum(["pending", "logged", "skipped"]).optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;
export type ScheduledItemCreateInput = z.infer<typeof scheduledItemCreateSchema>;
export type ScheduledItemUpdateInput = z.infer<typeof scheduledItemUpdateSchema>;

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
