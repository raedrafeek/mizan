"use client";

// register all modules in the client graph too — the registry is a separate
// module instance per bundle, so the server-side import alone is not enough
import "@/modules";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { getDestinations } from "./module-registry";
import { IconHome } from "./nav-icons";
import { AlertTray } from "./AlertTray";
import { usePrivacy } from "./privacy";

/**
 * Responsive shell: bottom tab bar + center log FAB on phones,
 * left rail on desktop. Destinations come from registered modules;
 * the shell owns only Home.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const destinations = [
    { id: "home", label: "Home", href: "/", icon: IconHome, order: 0 },
    ...getDestinations(),
  ];

  return (
    <div className="min-h-screen">
      <TopBar />
      <Rail destinations={destinations} />
      <main
        className={cn(
          "mx-auto max-w-[1200px] px-4 py-4 md:px-10 md:py-8",
          "pb-[calc(92px+env(safe-area-inset-bottom))] md:ml-56 md:pb-10",
        )}
      >
        {children}
      </main>
      <TabBar destinations={destinations} />
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-[22px] w-[22px] rotate-45 items-center justify-center rounded-md border-[1.5px] border-ink">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-pos" />
      </span>
      <span className="text-[14px] font-bold tracking-[3px]">MIZAN</span>
    </Link>
  );
}

function PrivacyButton() {
  const { privacy, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      className={privacy ? "flex text-warn" : "flex text-muted hover:text-ink"}
      aria-label={privacy ? "Show balances" : "Hide balances"}
      title={privacy ? "Privacy mode ON" : "Privacy mode"}
    >
      {privacy ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18 M10.5 10.7a2.2 2.2 0 0 0 3 3.1 M7.4 7.5C4.9 8.9 3 12 3 12s3.5 6 9 6c1.6 0 3-.5 4.3-1.2 M11 6.06A9.8 9.8 0 0 1 12 6c5.5 0 9 6 9 6s-.8 1.4-2.2 2.8" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z M12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4" />
        </svg>
      )}
    </button>
  );
}

function LockButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
      className="flex text-muted hover:text-ink"
      aria-label="Lock app"
      title="Lock"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2.5" />
      </svg>
    </button>
  );
}

/** Phone-only top bar: brand + status actions. */
function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-5 border-b border-border bg-bg/90 px-4 backdrop-blur md:hidden">
      <Brand />
      <div className="flex-1" />
      <PrivacyButton />
      <AlertTray />
      <LockButton />
    </header>
  );
}

type Destination = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  order: number;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop-only left rail. */
function Rail({ destinations }: { destinations: Destination[] }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav className="mt-8 flex flex-col gap-1">
        {destinations.map((d) => {
          const active = isActive(pathname, d.href);
          const Icon = d.icon;
          return (
            <Link
              key={d.href}
              href={d.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px]",
                active
                  ? "bg-inset font-semibold text-ink"
                  : "font-medium text-muted hover:bg-card hover:text-ink",
              )}
            >
              <Icon size={17} />
              {d.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <Link
        href="/categories"
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-[12px]",
          pathname.startsWith("/categories")
            ? "font-semibold text-ink"
            : "text-faint hover:text-ink",
        )}
      >
        Categories
      </Link>
      <div className="mt-3 flex items-center gap-5 border-t border-border px-3 pt-4">
        <PrivacyButton />
        <AlertTray />
        <LockButton />
      </div>
    </aside>
  );
}

/** Phone-only bottom tab bar with the log FAB in the middle. */
function TabBar({ destinations }: { destinations: Destination[] }) {
  const pathname = usePathname();
  const left = destinations.slice(0, 2);
  const right = destinations.slice(2);

  const tab = (d: Destination) => {
    const active = isActive(pathname, d.href);
    const Icon = d.icon;
    return (
      <Link
        key={d.href}
        href={d.href}
        className={cn(
          "flex w-16 flex-col items-center gap-1 py-1 text-[9px] font-bold tracking-[0.8px]",
          active ? "text-ink" : "text-faint",
        )}
      >
        <Icon size={20} />
        {d.label.toUpperCase()}
      </Link>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur md:hidden"
      style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}
    >
      {left.map(tab)}
      <Link
        href="/log"
        aria-label="Log an entry"
        className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-surface shadow-[0_8px_24px_rgba(0,0,0,.5),0_0_0_6px_var(--color-bg)] active:scale-95"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
      {right.map(tab)}
    </nav>
  );
}
