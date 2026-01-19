import * as React from "react";
import { cn } from "@/lib/utils";

const EmptyState = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-slate-400", className)} {...props} />
));
EmptyState.displayName = "EmptyState";

export { EmptyState };
