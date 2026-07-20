/**
 * Kuwait (UTC+3) civil date — the app's single-user timezone anchor.
 * Every "what day is it" decision must go through here so a future
 * settings-driven timezone is a one-file change.
 */
export function kuwaitToday(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Current month key ("2026-07") in Kuwait time. */
export function kuwaitMonth(): string {
  return kuwaitToday().slice(0, 7);
}
