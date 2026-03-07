import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { z } from "zod";
import App from "@/App";
import { CanvasPage } from "@/pages/canvas";
import { EditorPage } from "@/pages/editor";
import { ImageLabPage } from "@/pages/image-lab";
import { LibraryPage } from "@/pages/library";

const editorSearchSchema = z.object({
  assetId: z.string().optional().catch(undefined),
});

const rootRoute = createRootRoute({
  component: App,
});

const imageLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ImageLabPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryPage,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  validateSearch: editorSearchSchema,
  component: EditorPage,
});

const canvasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/canvas",
  component: CanvasPage,
});

const canvasDocumentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/canvas/$documentId",
  component: CanvasPage,
});

const routeTree = rootRoute.addChildren([
  imageLabRoute,
  libraryRoute,
  editorRoute,
  canvasRoute,
  canvasDocumentRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
