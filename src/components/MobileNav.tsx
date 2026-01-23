import { Link } from "@tanstack/react-router";
import { navItems } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/90 px-2 py-2 backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.to}
              asChild
              variant="ghost"
              size="sm"
              className="h-auto min-h-12 w-full flex-col gap-1 px-2 py-2 text-[11px] font-medium text-slate-300"
            >
              <Link
                to={item.to}
                activeProps={{ className: "bg-slate-800 text-white" }}
              >
                <Icon className="h-4 w-4" />
                <span className="leading-none">{item.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
