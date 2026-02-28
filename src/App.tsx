import { useEffect } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAssetStore } from "@/stores/assetStore";
import { useAppStore } from "@/stores/appStore";

const resolveModuleFromPath = (pathname: string) => {
  if (pathname === "/library") {
    return "library";
  }
  if (pathname === "/editor") {
    return "editor";
  }
  if (pathname.startsWith("/canvas")) {
    return "canvas";
  }
  return "chat";
};

function App() {
  const initAssets = useAssetStore((state) => state.init);
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const pathname = useLocation({ select: (state) => state.pathname });

  useEffect(() => {
    void initAssets();
  }, [initAssets]);

  useEffect(() => {
    const nextModule = resolveModuleFromPath(pathname);
    setActiveModule(nextModule);
  }, [pathname, setActiveModule]);

  return (
    <AppShell>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
