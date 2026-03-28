import type { Asset, EditingAdjustments, FilmProfile } from "@/types";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1, type ImageRenderDocument } from "./types";
import {
  legacyEditingAdjustmentsToCanvasImageRenderState,
  resolveImageRenderSource,
} from "./stateCompiler";

export interface LegacyImageRenderDocumentOptions {
  id: string;
  asset: Asset;
  adjustments?: EditingAdjustments;
  filmProfileId?: string | null | undefined;
  filmProfile?: FilmProfile | null | undefined;
}

export const legacyEditingAdjustmentsToCanvasImageRenderStateDocument = ({
  id,
  asset,
  state,
}: {
  id: string;
  asset: Asset;
  state: CanvasImageRenderStateV1;
}): ImageRenderDocument =>
  createImageRenderDocumentFromState({
    id,
    source: resolveImageRenderSource(asset),
    state,
  });

export const legacyEditingAdjustmentsToImageRenderDocument = ({
  id,
  asset,
  adjustments,
  filmProfileId,
  filmProfile,
}: LegacyImageRenderDocumentOptions): ImageRenderDocument =>
  legacyEditingAdjustmentsToCanvasImageRenderStateDocument({
    id,
    asset,
    state: legacyEditingAdjustmentsToCanvasImageRenderState({
      asset,
      adjustments,
      filmProfileId,
      filmProfile,
    }),
  });

export { legacyEditingAdjustmentsToCanvasImageRenderState } from "./stateCompiler";
