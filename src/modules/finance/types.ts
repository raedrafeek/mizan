// API DTO shapes (after jsonSafe: BigInt → number, Decimal → string)

export interface CurrencyDto {
  code: string;
  name: string;
  symbol: string;
  exponent: number;
  isFiat: boolean;
}

export interface AccountBalanceDto {
  accountId: string;
  balanceMinor: number;
  currencyCode: string;
  balanceDefaultMinor: number;
  stale: boolean;
  priceStatus: "ok" | "stale" | "missing" | null;
}

export interface AccountDto {
  id: string;
  name: string;
  kind: "transactional" | "priced";
  subtype: "bank" | "cash" | "credit_card" | "crypto" | "stock" | "loan" | "other";
  currencyCode: string;
  isLiability: boolean;
  includeInNetWorth: boolean;
  openingBalanceMinor: number;
  assetSymbol: string | null;
  quantity: string | null;
  priceSource: "coingecko" | "finnhub" | "manual" | null;
  manualPriceMinor: number | null;
  icon: string;
  mask: string | null;
  sortOrder: number;
  currency: CurrencyDto;
  balance: AccountBalanceDto | null;
}

export interface CategoryDto {
  id: string;
  module: string;
  name: string;
  type: "expense" | "income";
  icon: string;
  sortOrder: number;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  type: "expense" | "income" | "transfer_out" | "transfer_in" | "adjustment";
  amountMinor: number;
  currencyCode: string;
  fxRateToDefault: string;
  amountDefaultMinor: number;
  categoryId: string | null;
  date: string;
  note: string | null;
  transferGroupId: string | null;
  category: CategoryDto | null;
  account: { name: string; currencyCode: string };
}

export interface CurrenciesResponse {
  currencies: CurrencyDto[];
  defaultCurrency: string;
  rates: Record<string, { rate: string; stale: boolean; asOfDate: string | null }>;
}

export interface TransactionsPage {
  items: TransactionDto[];
  nextCursor: string | null;
}
