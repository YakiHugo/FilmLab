import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import App from "@/App";
import { Workspace } from "@/pages/Workspace";

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

const routeTree = rootRoute.addChildren([landingRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
