/** Shared navigation icons — stroke style matches the finance Icon set. */

function Svg({ size = 20, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconHome({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function IconActivity({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  );
}

export function IconPlan({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Svg>
  );
}

export function IconAccounts({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18M7 15h4" />
    </Svg>
  );
}
