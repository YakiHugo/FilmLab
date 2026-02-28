import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  count,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={cn("space-y-2", className)}>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs font-medium text-zinc-300 transition hover:bg-white/5"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", isOpen && "rotate-90")}
        />
        <span className="uppercase tracking-[0.16em]">{title}</span>
        {typeof count === "number" && (
          <span className="ml-auto text-[11px] text-zinc-500">{count}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="min-h-0">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
