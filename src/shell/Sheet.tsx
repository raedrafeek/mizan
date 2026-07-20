"use client";

import { useEffect, useRef } from "react";

/**
 * The one bottom-sheet/dialog wrapper (8 ad-hoc copies predate it). Owns
 * the semantics every sheet was missing: role=dialog + aria-modal, Escape
 * to close, a Tab trap, focus moved in on open and restored on close, and
 * backdrop-click close. Panel styling stays with the caller (pass the full
 * class string) so migrated sheets keep their exact look.
 */
export function Sheet({
  onClose,
  label,
  panelClassName,
  children,
}: {
  onClose: () => void;
  /** accessible name for the dialog */
  label: string;
  /** complete class string for the panel (not merged with defaults) */
  panelClassName: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={panelClassName + " outline-none"}
      >
        {children}
      </div>
    </div>
  );
}
