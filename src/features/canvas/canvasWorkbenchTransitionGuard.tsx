import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

type CanvasWorkbenchTransitionHandler = () => Promise<void> | void;

interface CanvasWorkbenchTransitionGuardContextValue {
  registerHandler: (handler: CanvasWorkbenchTransitionHandler) => () => void;
  runBeforeWorkbenchTransition: () => Promise<void>;
}

const CanvasWorkbenchTransitionGuardContext =
  createContext<CanvasWorkbenchTransitionGuardContextValue | null>(null);

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
