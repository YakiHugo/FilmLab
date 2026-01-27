import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useProjectStore } from "@/stores/projectStore";
import { AppHeader } from "@/components/layout/AppHeader";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { MobileNav } from "@/components/layout/MobileNav";

function App() {
  const init = useProjectStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 app-bg" />
      <div className="relative flex min-h-screen w-full flex-col md:grid md:grid-cols-[260px_1fr]">
        <DesktopNav />
        <div className="flex min-h-screen min-w-0 flex-col">
          <AppHeader />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-28 pt-6 md:px-8 md:pb-10 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}

export default App;
