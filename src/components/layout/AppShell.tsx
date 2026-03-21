import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Header } from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = useLocation({ select: (state) => state.pathname });
  const isCanvasRoute = pathname.startsWith("/canvas");
  const isProjectRoute = pathname === "/" || isCanvasRoute;
  const isLibraryRoute = pathname === "/library";
  const isAssistRoute = pathname === "/assist";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#121214] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 app-shell-atmosphere" />
      <div className="relative flex h-full flex-col">
        {isCanvasRoute ? null : <Header />}
        <main
          className={cn(
            "relative w-full flex-1 min-w-0 min-h-0",
            isProjectRoute || isLibraryRoute || isAssistRoute
              ? "px-0 pb-0 pt-0"
              : "mx-auto max-w-[1600px] px-3 pb-4 pt-4 lg:px-5"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
