import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasWorkbenchTransitionGuardProvider } from "../canvasWorkbenchTransitionGuard";
import { useCanvasStore } from "@/stores/canvasStore";
import { isCanvasRoutePath, resolveCanvasRouteWorkbenchId } from "./useCanvasRouteWorkbenchSync";
import { useCanvasRouteWorkbenchSync } from "./useCanvasRouteWorkbenchSync";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/canvas/missing-workbench",
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (state: { pathname: string }) => string }) =>
    select({ pathname: routerMocks.pathname }),
  useNavigate: () => routerMocks.navigate,
}));

const originalInit = useCanvasStore.getState().init;
const originalOpenWorkbench = useCanvasStore.getState().openWorkbench;

const flushMicrotasks = async (count = 8) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
};

function RouteSyncHarness() {
  useCanvasRouteWorkbenchSync();
  return null;
}

afterEach(() => {
  routerMocks.navigate.mockReset();
  routerMocks.pathname = "/canvas/missing-workbench";
  useCanvasStore.setState({
    init: originalInit,
    loadedWorkbenchId: null,
    openWorkbench: originalOpenWorkbench,
    workbench: null,
    workbenchDraft: null,
    workbenchInteraction: null,
    workbenchList: [],
  });
});

describe("resolveCanvasRouteWorkbenchId", () => {
  it("returns null for non-canvas paths and the canvas root", () => {
    expect(resolveCanvasRouteWorkbenchId("/")).toBeNull();
    expect(resolveCanvasRouteWorkbenchId("/canvas")).toBeNull();
    expect(resolveCanvasRouteWorkbenchId("/library")).toBeNull();
  });

  it("returns the decoded workbench id for canvas document routes", () => {
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench-1")).toBe("workbench-1");
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench%20id")).toBe("workbench id");
  });

  it("rejects nested canvas paths that are not a direct workbench route", () => {
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench-1/extra")).toBeNull();
  });

  it("distinguishes canvas routes from locations being left", () => {
    expect(isCanvasRoutePath("/canvas")).toBe(true);
    expect(isCanvasRoutePath("/canvas/workbench-1")).toBe(true);
    expect(isCanvasRoutePath("/")).toBe(false);
    expect(isCanvasRoutePath("/canvas-lab")).toBe(false);
  });

  it("recovers once when a missing route toggles the loaded workbench queue", async () => {
    const init = vi.fn().mockResolvedValue(true);
    routerMocks.navigate.mockImplementation(
      async ({ params }: { params?: { workbenchId?: string } }) => {
        if (params?.workbenchId) {
          routerMocks.pathname = `/canvas/${params.workbenchId}`;
        }
      }
    );
    const openWorkbench = vi.fn(async () => {
      useCanvasStore.setState({
        workbenchInteraction: {
          active: false,
          pendingCommits: 0,
          queuedMutations: 1,
        },
      });
      await Promise.resolve();
      useCanvasStore.setState({ workbenchInteraction: null });
      return null;
    });
    useCanvasStore.setState({
      init,
      loadedWorkbenchId: "workbench-1",
      openWorkbench,
      workbenchInteraction: null,
      workbenchList: [
        {
          coverAssetId: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          elementCount: 1,
          height: 1350,
          id: "workbench-1",
          name: "Existing",
          presetId: "social-portrait",
          updatedAt: "2026-07-01T00:00:00.000Z",
          width: 1080,
        },
      ],
    });

    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = create(
        createElement(CanvasWorkbenchTransitionGuardProvider, null, createElement(RouteSyncHarness))
      );
      await flushMicrotasks(16);
    });

    expect(openWorkbench).toHaveBeenCalledTimes(1);
    expect(routerMocks.navigate).toHaveBeenCalledWith({
      params: { workbenchId: "workbench-1" },
      to: "/canvas/$workbenchId",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });
});
