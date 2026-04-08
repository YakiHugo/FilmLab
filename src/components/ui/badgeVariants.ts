import { cva } from "class-variance-authority";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full border font-medium leading-none transition-colors tabular-nums",
  {
    variants: {
      variant: {
        default: "border-white/15 bg-white/5 text-slate-200",
        secondary: "border-white/10 bg-slate-900/70 text-slate-100",
        outline: "border-white/10 text-slate-200",
      },
      size: {
        sm: "h-6 px-2 text-[11px]",
        default: "h-7 px-2.5 text-xs",
        control: "h-9 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
