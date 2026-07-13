"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { getNavItems } from "./module-registry";
import { FxTicker } from "@/modules/finance/components/FxTicker";

export function Nav() {
  const pathname = usePathname();
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
    </header>
  );
}
