import { cn } from "@/lib/cn";

export function Card({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-border-2 bg-card p-4.5", className)}
    >
      {title && (
        <div className="mb-3.5 flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-[2px] text-muted">
            {title}
          </h2>
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
