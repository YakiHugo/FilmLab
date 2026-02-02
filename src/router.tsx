import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import App from "@/App";
import { Workspace } from "@/pages/Workspace";
import { Editor } from "@/pages/Editor";

const rootRoute = createRootRoute({
  component: App,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => ({
    step:
      search.step === "style" || search.step === "export"
        ? search.step
        : "library",
  }),
  component: Workspace,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  validateSearch: (search: Record<string, unknown>) => ({
    assetId: typeof search.assetId === "string" ? search.assetId : undefined,
  }),
  component: Editor,
});

const routeTree = rootRoute.addChildren([landingRoute, editorRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
