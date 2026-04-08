import { createContext, useContext, useEffect } from "react";

export type CanvasWorkbenchTransitionHandler = () => Promise<void> | void;

export interface CanvasWorkbenchTransitionGuardContextValue {
  registerHandler: (handler: CanvasWorkbenchTransitionHandler) => () => void;
  runBeforeWorkbenchTransition: () => Promise<void>;
}

export const CanvasWorkbenchTransitionGuardContext =
  createContext<CanvasWorkbenchTransitionGuardContextValue | null>(null);

const useCanvasWorkbenchTransitionGuardContext = () => {
  const context = useContext(CanvasWorkbenchTransitionGuardContext);
  if (!context) {
    throw new Error(
      "Canvas workbench transition guard hooks must be used within CanvasWorkbenchTransitionGuardProvider."
    );
  }

  return context;
};

export const useCanvasWorkbenchTransitionGuard = () =>
  useCanvasWorkbenchTransitionGuardContext().runBeforeWorkbenchTransition;

export const useOptionalCanvasWorkbenchTransitionGuard = () =>
  useContext(CanvasWorkbenchTransitionGuardContext)?.runBeforeWorkbenchTransition ??
  (async () => {});

export const useRegisterCanvasWorkbenchTransitionGuard = (
  handler: CanvasWorkbenchTransitionHandler
) => {
  const { registerHandler } = useCanvasWorkbenchTransitionGuardContext();

  useEffect(() => registerHandler(handler), [handler, registerHandler]);
};
