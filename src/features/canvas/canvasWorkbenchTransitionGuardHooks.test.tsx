import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CanvasWorkbenchTransitionGuardProvider } from "./canvasWorkbenchTransitionGuard";
import {
  type CanvasWorkbenchTransitionHandler,
  useCanvasWorkbenchTransitionGuard,
  useOptionalCanvasWorkbenchTransitionGuard,
  useRegisterCanvasWorkbenchTransitionGuard,
} from "./canvasWorkbenchTransitionGuardHooks";

let currentGuard: (() => Promise<void>) | null = null;

function RequiredGuardConsumer() {
  const runBeforeWorkbenchTransition = useCanvasWorkbenchTransitionGuard();
  currentGuard = runBeforeWorkbenchTransition;

  return <span>{typeof runBeforeWorkbenchTransition}</span>;
}

function OptionalGuardConsumer() {
  const runBeforeWorkbenchTransition = useOptionalCanvasWorkbenchTransitionGuard();

  return <span>{typeof runBeforeWorkbenchTransition}</span>;
}

function GuardRegistrar({
  handler,
}: {
  handler: CanvasWorkbenchTransitionHandler;
}) {
  useRegisterCanvasWorkbenchTransitionGuard(handler);

  return null;
}

function GuardHarness({
  handler,
  register = true,
}: {
  handler: CanvasWorkbenchTransitionHandler;
  register?: boolean;
}) {
  return (
    <CanvasWorkbenchTransitionGuardProvider>
      <RequiredGuardConsumer />
      {register ? <GuardRegistrar handler={handler} /> : null}
    </CanvasWorkbenchTransitionGuardProvider>
  );
}

describe("canvas workbench transition guard hooks", () => {
  it("provides the required transition guard hook inside the provider", () => {
    const html = renderToStaticMarkup(
      <CanvasWorkbenchTransitionGuardProvider>
        <RequiredGuardConsumer />
      </CanvasWorkbenchTransitionGuardProvider>
    );

    expect(html).toContain("function");
  });

  it("returns a fallback function for the optional hook outside the provider", () => {
    const html = renderToStaticMarkup(<OptionalGuardConsumer />);

    expect(html).toContain("function");
  });

  it("throws when the required hook is used outside the provider", () => {
    expect(() => renderToStaticMarkup(<RequiredGuardConsumer />)).toThrow(
      "Canvas workbench transition guard hooks must be used within CanvasWorkbenchTransitionGuardProvider."
    );
  });

  it("runs the currently registered handler before transitions", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      create(<GuardHarness handler={handler} />);
    });
    await act(async () => {
      await currentGuard?.();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("updates to the latest registered handler", async () => {
    const firstHandler = vi.fn().mockResolvedValue(undefined);
    const secondHandler = vi.fn().mockResolvedValue(undefined);

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<GuardHarness handler={firstHandler} />);
    });
    await act(async () => {
      await currentGuard?.();
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.update(<GuardHarness handler={secondHandler} />);
    });
    await act(async () => {
      await currentGuard?.();
    });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("clears the registered handler when the registrar unmounts", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(<GuardHarness handler={handler} />);
    });
    await act(async () => {
      await currentGuard?.();
    });
    expect(handler).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.update(<GuardHarness handler={handler} register={false} />);
    });
    await act(async () => {
      await currentGuard?.();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
