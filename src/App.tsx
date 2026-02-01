import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useProjectStore } from "@/stores/projectStore";
import { AppHeader } from "@/components/layout/AppHeader";

function App() {
  const init = useProjectStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 app-bg" />
      <div className="relative flex min-h-screen w-full flex-col">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-28 pt-6 md:px-8 md:pb-10 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default App;
