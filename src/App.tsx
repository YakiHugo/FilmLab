import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { MobileNav } from "@/components/MobileNav";

function App() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 text-slate-100 md:h-screen md:flex-row">
      <Sidebar className="hidden md:flex" />
      <div className="flex min-h-screen flex-1 flex-col md:h-screen">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-6 md:py-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

export default App;
