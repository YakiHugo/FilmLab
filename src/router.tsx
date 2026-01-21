import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import App from "@/App";
import { Landing } from "@/pages/Landing";
import { Library } from "@/pages/Library";
import { BatchStudio } from "@/pages/BatchStudio";
import { Editor } from "@/pages/Editor";
import { ExportPage } from "@/pages/Export";

const rootRoute = createRootRoute({
  component: App,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Landing,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: Library,
});

const batchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/batch",
  component: BatchStudio,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  component: Editor,
});

const exportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/export",
  component: ExportPage,
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  libraryRoute,
  batchRoute,
  editorRoute,
  exportRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
