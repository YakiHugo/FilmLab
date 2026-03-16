import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { z } from "zod";
import App from "@/App";
import { CanvasPage } from "@/pages/canvas";
import { EditorPage } from "@/pages/editor";
import { ImageLabPage } from "@/pages/image-lab";
import { LibraryPage } from "@/pages/library";
import { StudioPage } from "@/pages/studio";

const editorSearchSchema = z.object({
  assetId: z.string().optional().catch(undefined),
  mode: z.enum(["advanced"]).optional().catch(undefined),
});

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

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  validateSearch: editorSearchSchema,
  component: EditorPage,
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
  path: "/canvas/$documentId",
  component: CanvasPage,
});

const routeTree = rootRoute.addChildren([
  studioRoute,
  libraryRoute,
  editorRoute,
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
