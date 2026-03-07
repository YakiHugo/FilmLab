import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppModule = "images" | "library" | "editor" | "canvas";

interface AppState {
  activeModule: AppModule;
  mobileNavOpen: boolean;
  setActiveModule: (module: AppModule) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      activeModule: "images",
      mobileNavOpen: false,
      setActiveModule: (activeModule) => set({ activeModule }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    }),
    { name: "AppStore", enabled: process.env.NODE_ENV === "development" }
  )
);
