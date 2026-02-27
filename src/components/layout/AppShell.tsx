import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Header } from "./Header";
import { LibrarySidebar } from "./LibrarySidebar";

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
        {isLibraryRoute ? (
          <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-5 px-3 pb-4 pt-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-5">
            <LibrarySidebar className="hidden lg:flex" />
            <main className="min-w-0">{children}</main>
          </div>
        ) : (
          <main className="mx-auto w-full max-w-[1600px] flex-1 min-w-0 px-3 pb-4 pt-4 lg:px-5">
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
