"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
  action?: ToastAction;
}

const ToastContext = createContext<{
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
}>({ success: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast["kind"], message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message, action }]);
    // toasts with an action stay longer — the user may want to hit it
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);

  const api = useRef({
    success: (m: string, a?: ToastAction) => push("success", m, a),
    error: (m: string, a?: ToastAction) => push("error", m, a),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl",
              t.kind === "success"
                ? "border-pos/30 bg-card text-ink"
                : "border-neg/40 bg-card text-ink",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 flex-none rounded-full",
                t.kind === "success" ? "bg-pos" : "bg-neg",
              )}
            />
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
                className="flex-none text-[11px] font-bold tracking-[1.2px] text-pos"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
