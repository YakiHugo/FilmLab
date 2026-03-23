import { createContext, useContext } from "react";
import type { CanvasRuntimeScope } from "./canvasRuntimeScope";

export const CanvasRuntimeContext = createContext<CanvasRuntimeScope | null>(null);

export const useCanvasRuntimeScope = () => {
  const scope = useContext(CanvasRuntimeContext);
  if (!scope) {
    throw new Error("Canvas runtime scope is unavailable outside CanvasRuntimeProvider.");
  }
  return scope;
};
