import { cn } from "@/lib/cn";

/**
 * Section card. The title renders as an eyebrow ABOVE the bordered box
 * (page rhythm comes from the eyebrows; the card itself stays clean).
 * `className` styles the bordered box, as before.
 */
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
  const box = (
    <div className={cn("rounded-2xl border border-border-2 bg-card p-4.5", className)}>
      {children}
    </div>
  );
  if (!title) return box;
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[10.5px] font-bold tracking-[2px] text-faint">{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {box}
    </section>
  );
}
