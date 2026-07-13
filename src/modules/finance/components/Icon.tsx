// Icon paths lifted from the Reference mockup (24x24 stroke icons)
const PATHS: Record<string, string> = {
  bank: "M3 21h18 M5.5 21v-8.5 M10 21v-8.5 M14 21v-8.5 M18.5 21v-8.5 M3 10h18L12 3.5z",
  wallet:
    "M20 7H5a2 2 0 0 1 0-4h13v4 M3 5v14a2 2 0 0 0 2 2h15v-6 M21 12v5h-5a2.5 2.5 0 0 1 0-5h5z",
  credit_card: "M2.5 6.5h19v11h-19z M2.5 10.5h19 M5.5 14h4",
  crypto:
    "M12 2.5l7.8 4.75v9.5L12 21.5l-7.8-4.75v-9.5z M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 1 0 0-7.6",
  stock: "M4 20h16 M6.5 20v-6 M11 20V7 M15.5 20v-9 M20 20V4",
  loan: "M2.5 7h19v10h-19z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5",
  groceries: "M5 8h14l-1.5 11a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8L5 8z M8 8V6a4 4 0 0 1 8 0v2",
  housing: "M3 10.5 12 3l9 7.5 M5.5 9v11.5h13V9 M9.5 20.5v-6h5v6",
  transport:
    "M5.5 11 7 6.8A2 2 0 0 1 8.9 5.5h6.2a2 2 0 0 1 1.9 1.3L18.5 11 M4 16.5v-3a2.5 2.5 0 0 1 2.5-2.5h11a2.5 2.5 0 0 1 2.5 2.5v3 M6.5 16.5a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0 -2.8 0 M14.7 16.5a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0 -2.8 0",
  health:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z",
  dining: "M7 2v20 M4.5 2v5.5a2.5 2.5 0 0 0 5 0V2 M17 2v20 M17 2c3.2 1.6 3.2 8.4 0 10",
  financial: "M3 21h18 M5.5 21v-8.5 M10 21v-8.5 M14 21v-8.5 M18.5 21v-8.5 M3 10h18L12 3.5z",
  other:
    "M4.6 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0 -2.4 0 M10.8 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0 -2.4 0 M17 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0 -2.4 0",
  salary:
    "M2.5 7h19v10h-19z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5 M5.8 12h.01 M18.2 12h.01",
  bonus:
    "M3.5 8.5h17v4h-17z M5 12.5h14V21H5z M12 8.5V21 M12 8.5C10 8.3 7.5 7.5 7.5 5.5a1.8 1.8 0 0 1 3.5-.5c.5 1 .8 2.3 1 3.5 M12 8.5c2-.2 4.5-1 4.5-3a1.8 1.8 0 0 0-3.5-.5c-.5 1-.8 2.3-1 3.5",
  project: "M3.5 8h17v12h-17z M8.5 8V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V8 M3.5 13h17",
  cash: "M20 7H5a2 2 0 0 1 0-4h13v4 M3 5v14a2 2 0 0 0 2 2h15v-6 M21 12v5h-5a2.5 2.5 0 0 1 0-5h5z",
};

export function Icon({
  name,
  size = 14,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name] ?? PATHS.other} />
    </svg>
  );
}
