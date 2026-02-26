import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { z } from "zod";
import App from "@/App";
import { Workspace } from "@/pages/Workspace";
import { Editor } from "@/pages/Editor";

const workspaceStepSchema = z.enum(["library", "style", "export"]);

const workspaceSearchSchema = z.object({
  step: workspaceStepSchema.catch("library"),
});

const editorSearchSchema = z.object({
  assetId: z.string().optional().catch(undefined),
  returnStep: workspaceStepSchema.optional().catch(undefined),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;
export type EditorSearch = z.infer<typeof editorSearchSchema>;

const rootRoute = createRootRoute({
  component: App,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: workspaceSearchSchema,
  component: Workspace,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/editor",
  validateSearch: editorSearchSchema,
  component: Editor,
});

const routeTree = rootRoute.addChildren([landingRoute, editorRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
