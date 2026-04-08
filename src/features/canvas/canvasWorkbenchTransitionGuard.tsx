import { useCallback, useMemo, useRef, type PropsWithChildren } from "react";
import {
  CanvasWorkbenchTransitionGuardContext,
  type CanvasWorkbenchTransitionGuardContextValue,
  type CanvasWorkbenchTransitionHandler,
} from "./canvasWorkbenchTransitionGuardHooks";

export function CanvasWorkbenchTransitionGuardProvider({
  children,
}: PropsWithChildren) {
  const handlerRef = useRef<CanvasWorkbenchTransitionHandler | null>(null);

  const registerHandler = useCallback((handler: CanvasWorkbenchTransitionHandler) => {
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
    };
  }, []);

  const runBeforeWorkbenchTransition = useCallback(async () => {
    await handlerRef.current?.();
  }, []);

  const value = useMemo<CanvasWorkbenchTransitionGuardContextValue>(
    () => ({
      registerHandler,
      runBeforeWorkbenchTransition,
    }),
    [registerHandler, runBeforeWorkbenchTransition]
  );

  return (
    <CanvasWorkbenchTransitionGuardContext.Provider value={value}>
      {children}
    </CanvasWorkbenchTransitionGuardContext.Provider>
  );
}
