import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-card p-8 sm:p-12 text-center", className)}>
      {icon && <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-xl brand-gradient">{icon}</div>}
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-muted-foreground text-sm max-w-md mx-auto">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
      <div>
        {eyebrow && <p className="text-xs uppercase tracking-wider font-semibold text-primary">{eyebrow}</p>}
        <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
