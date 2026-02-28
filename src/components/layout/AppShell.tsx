import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Header } from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = useLocation({ select: (state) => state.pathname });
  const isLibraryRoute = pathname === "/library";

  return (
    <div className="relative min-h-screen w-full bg-[#1b1b1d] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 app-shell-atmosphere" />
      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main
          className={cn(
            "w-full flex-1 min-w-0",
            isLibraryRoute ? "px-0 pb-0 pt-0" : "mx-auto max-w-[1600px] px-3 pb-4 pt-4 lg:px-5"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
