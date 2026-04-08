import { useMemo } from "react";
import { useAssetStore } from "@/stores/assetStore";
import type { CanvasTextFontSizeTier } from "@/types";
import { resolveCanvasImageRenderState } from "../imageRenderState";
import {
  CANVAS_TEXT_COLOR_OPTIONS,
  CANVAS_TEXT_FONT_OPTIONS,
  getCanvasTextColorOption,
  getCanvasTextFontOption,
} from "../textStyle";
import { useCanvasImagePropertyActions } from "./useCanvasImagePropertyActions";
import { useCanvasNodePropertyActions } from "./useCanvasNodePropertyActions";
import { useCanvasSelectionModel } from "./useCanvasSelectionModel";

export function useCanvasPropertiesPanelModel() {
  const assets = useAssetStore((state) => state.assets);
  const { primarySelectedElement } = useCanvasSelectionModel();
  const selected = primarySelectedElement;
  const { activeWorkbench, commitIntent } = useCanvasNodePropertyActions(selected);

  const selectedAsset = useMemo(() => {
    if (!selected || selected.type !== "image") {
      return null;
    }

    return assets.find((asset) => asset.id === selected.assetId) ?? null;
  }, [assets, selected]);

  const {
    setRenderState: setImageRenderState,
    setFilmProfileId: commitImageFilmProfileId,
  } = useCanvasImagePropertyActions(selected?.type === "image" ? selected : null, selectedAsset);

  const textFontOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_FONT_OPTIONS;
    }

    const current = getCanvasTextFontOption(selected.fontFamily);
    return CANVAS_TEXT_FONT_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_FONT_OPTIONS
      : [...CANVAS_TEXT_FONT_OPTIONS, current];
  }, [selected]);

  const textColorOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_COLOR_OPTIONS;
    }

    const current = getCanvasTextColorOption(selected.color);
    return CANVAS_TEXT_COLOR_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_COLOR_OPTIONS
      : [...CANVAS_TEXT_COLOR_OPTIONS, current];
  }, [selected]);

  const selectedImageRenderState = useMemo(() => {
    if (!selected || selected.type !== "image") {
      return null;
    }
    return resolveCanvasImageRenderState(selected, selectedAsset);
  }, [selected, selectedAsset]);

  return {
    activeWorkbench,
    selectedImageRenderState,
    selected,
    selectedAsset,
    setFilmProfileId: (value: string) =>
      commitImageFilmProfileId(value === "none" ? undefined : value),
    setImageRenderState,
    setFill: (value: string) => commitIntent({ type: "set-shape-fill", value }),
    setFontFamily: (value: string) => commitIntent({ type: "set-text-font-family", value }),
    setFontSizeTier: (value: CanvasTextFontSizeTier) =>
      commitIntent({ type: "set-text-font-size-tier", value }),
    setHeight: (value: number) => commitIntent({ type: "set-height", value }),
    setOpacity: (value: number) => commitIntent({ type: "set-opacity", value }),
    setRotation: (value: number) => commitIntent({ type: "set-rotation", value }),
    setStroke: (value: string) => commitIntent({ type: "set-shape-stroke", value }),
    setStrokeWidth: (value: number) =>
      commitIntent({ type: "set-shape-stroke-width", value }),
    setTextAlign: (value: "left" | "center" | "right") =>
      commitIntent({ type: "set-text-align", value }),
    setTextColor: (value: string) => commitIntent({ type: "set-text-color", value }),
    setTextContent: (value: string) => commitIntent({ type: "set-text-content", value }),
    setWidth: (value: number) => commitIntent({ type: "set-width", value }),
    setX: (value: number) => commitIntent({ type: "set-x", value }),
    setY: (value: number) => commitIntent({ type: "set-y", value }),
    textColorOptions,
    textFontOptions,
  };
}
