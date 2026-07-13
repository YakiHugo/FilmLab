import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import App from "@/App";
import { RoutePending } from "@/components/RoutePending";

const StudioPage = lazyRouteComponent(() => import("@/pages/studio"), "StudioPage");
const LibraryPage = lazyRouteComponent(() => import("@/pages/library"), "LibraryPage");
const ImageLabPage = lazyRouteComponent(() => import("@/pages/image-lab"), "ImageLabPage");
const CanvasPage = lazyRouteComponent(() => import("@/pages/canvas"), "CanvasPage");

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

export const router = createRouter({
  routeTree,
  defaultPendingComponent: RoutePending,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
