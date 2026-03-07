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
  return "images";
};

function App() {
  const initAssets = useAssetStore((state) => state.init);
  const runAssetSync = useAssetStore((state) => state.runAssetSync);
  const setActiveModule = useAppStore((state) => state.setActiveModule);
  const pathname = useLocation({ select: (state) => state.pathname });

  useEffect(() => {
    void initAssets();
  }, [initAssets]);

  useEffect(() => {
    void runAssetSync();
    const timer = window.setInterval(() => {
      void runAssetSync();
    }, 20_000);
    const onOnline = () => {
      void runAssetSync();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [runAssetSync]);

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
