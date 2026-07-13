"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { getNavItems } from "./module-registry";
import { FxTicker } from "@/modules/finance/components/FxTicker";
import { AlertTray } from "./AlertTray";
import { usePrivacy } from "./privacy";

export function Nav() {
  const pathname = usePathname();
  const { privacy, toggle } = usePrivacy();
  const items = [{ label: "Home", href: "/" }, ...getNavItems()];

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border px-4 sm:gap-8 sm:px-8">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-[22px] w-[22px] rotate-45 items-center justify-center rounded-md border-[1.5px] border-ink">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-pos" />
        </span>
        <span className="text-[15px] font-bold tracking-[3px]">MIZAN</span>
      </Link>
      <nav className="ml-2 flex gap-1 overflow-x-auto hs">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-[10px] px-3.5 py-[7px] text-[13px]",
                active
                  ? "bg-inset font-semibold text-ink"
                  : "font-medium text-muted hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="hidden md:block">
        <FxTicker />
      </div>
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
      <AlertTray />
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
    </header>
  );
}
