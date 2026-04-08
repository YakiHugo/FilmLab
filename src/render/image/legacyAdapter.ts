import type { Asset, EditingAdjustments, FilmProfile } from "@/types";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1, type ImageRenderDocument } from "./types";
import {
  createCanvasImageRenderStateFromAsset,
  resolveImageRenderSource,
} from "./stateCompiler";

export interface AssetImageRenderDocumentOptions {
  id: string;
  asset: Asset;
  adjustments?: EditingAdjustments;
  filmProfileId?: string | null | undefined;
  filmProfile?: FilmProfile | null | undefined;
}

export const createImageRenderDocumentFromStateAndAsset = ({
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

export const createAssetImageRenderDocument = ({
  id,
  asset,
  adjustments,
  filmProfileId,
  filmProfile,
}: AssetImageRenderDocumentOptions): ImageRenderDocument =>
  createImageRenderDocumentFromStateAndAsset({
    id,
    asset,
    state: createCanvasImageRenderStateFromAsset({
      asset,
      adjustments,
      filmProfileId,
      filmProfile,
    }),
  });

export { createCanvasImageRenderStateFromAsset } from "./stateCompiler";
