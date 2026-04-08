export {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorColorGradingActions,
  useEditorColorGradingState,
  useEditorHistoryState,
  useEditorLayerActions,
  useEditorPresetActions,
  useEditorPresetState,
  useEditorSelectionState,
  useEditorViewState,
} from "./useEditorSlices";

import {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorColorGradingActions,
  useEditorColorGradingState,
  useEditorHistoryState,
  useEditorLayerActions,
  useEditorPresetActions,
  useEditorPresetState,
  useEditorSelectionState,
  useEditorViewState,
} from "./useEditorSlices";

export function useEditorState() {
  return {
    ...useEditorSelectionState(),
    ...useEditorViewState(),
    ...useEditorHistoryState(),
    ...useEditorAdjustmentState(),
    ...useEditorAdjustmentActions(),
    ...useEditorColorGradingState(),
    ...useEditorColorGradingActions(),
    ...useEditorPresetState(),
    ...useEditorPresetActions(),
    ...useEditorLayerActions(),
  };
}
