import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { z } from "zod";
import App from "@/App";
import { CanvasPage } from "@/features/canvas/CanvasPage";
import { ChatPage } from "@/features/chat/ChatPage";
import { EditorPage } from "@/features/editor/EditorPage";
import { LibraryPage } from "@/features/library/LibraryPage";

const editorSearchSchema = z.object({
  assetId: z.string().optional().catch(undefined),
});

export type EditorSearch = z.infer<typeof editorSearchSchema>;

const rootRoute = createRootRoute({
  component: App,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatPage,
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
  chatRoute,
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
