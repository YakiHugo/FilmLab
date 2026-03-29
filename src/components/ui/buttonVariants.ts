import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-white text-zinc-950 hover:bg-zinc-100 hover:shadow-lg hover:shadow-white/15 font-semibold",
        secondary:
          "border border-white/15 bg-[#0f1114]/85 text-zinc-200 hover:bg-[#161a1f] hover:border-white/25",
        ghost:
          "border border-transparent bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
