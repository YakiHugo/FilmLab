import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageStat {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface PageShellProps {
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  stats?: PageStat[];
  children: ReactNode;
  className?: string;
}

export function PageShell({
  title,
  description,
  kicker,
  actions,
  stats,
  children,
  className,
}: PageShellProps) {
  return (
    <section className={cn("space-y-6", className)}>
      <header className="glass-panel rounded-3xl p-5 md:p-6 animate-fade-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            {kicker && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                {kicker}
              </p>
            )}
            <h1 className="font-display text-2xl text-white md:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-2xl text-sm text-slate-300">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              {actions}
            </div>
          )}
        </div>

        {stats && stats.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {stats.map((stat, index) => (
              <div
                key={`${stat.label}-${index}`}
                className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 animate-fade-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {stat.value}
                </p>
                {stat.hint && (
                  <p className="text-[11px] text-slate-500">{stat.hint}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

