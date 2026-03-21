import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import App from "@/App";
import { CanvasPage } from "@/pages/canvas";
import { ImageLabPage } from "@/pages/image-lab";
import { LibraryPage } from "@/pages/library";
import { StudioPage } from "@/pages/studio";

const rootRoute = createRootRoute({
  component: App,
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: StudioPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryPage,
});

const assistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assist",
  component: ImageLabPage,
});

const canvasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/canvas",
  component: CanvasPage,
});

const canvasDocumentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/canvas/$workbenchId",
  component: CanvasPage,
});

const routeTree = rootRoute.addChildren([
  studioRoute,
  libraryRoute,
  assistRoute,
  canvasRoute,
  canvasDocumentRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
