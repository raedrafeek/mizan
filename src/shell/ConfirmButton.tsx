"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Two-tap destructive button: first tap arms it, second tap (within 3.5s)
 * confirms. Replaces native confirm() dialogs, which break the app feel
 * inside an installed PWA.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Tap again to confirm",
  onConfirm,
  disabled,
  className,
  armedClassName = "!border-neg !bg-neg/15 !text-neg",
}: {
  label: React.ReactNode;
  confirmLabel?: React.ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  armedClassName?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={cn(className, armed && armedClassName)}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
