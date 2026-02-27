import type Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { ImageElement } from "./elements/ImageElement";
import { ShapeElement } from "./elements/ShapeElement";
import { TextElement } from "./elements/TextElement";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

interface CanvasViewportProps {
  stageRef: React.RefObject<Konva.Stage>;
}

export function CanvasViewport({ stageRef }: CanvasViewportProps) {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);
  const { selectedElementIds, setSelectedElementIds } = useCanvasInteraction();
  const transformerRef = useRef<Konva.Transformer>(null);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const assetUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assets) {
      map.set(asset.id, asset.objectUrl);
    }
    return map;
  }, [assets]);

  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    const selectedId = selectedElementIds[0];
    if (!stage || !transformer || !selectedId) {
      transformer?.nodes([]);
      return;
    }
    const selectedNode = stage.findOne(`#${selectedId}`);
    if (!selectedNode) {
      transformer.nodes([]);
      return;
    }
    transformer.nodes([selectedNode]);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, stageRef, activeDocument?.updatedAt]);

  if (!activeDocument) {
    return (
      <div className="flex h-[620px] items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm text-zinc-500">
        Create or open a canvas document.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-2xl border border-white/10 bg-[#242426] p-6">
      <div className="mx-auto w-fit">
        <Stage ref={stageRef} width={activeDocument.width} height={activeDocument.height}>
          <Layer>
            <Rect
              x={0}
              y={0}
              width={activeDocument.width}
              height={activeDocument.height}
              fill={activeDocument.backgroundColor}
              onClick={() => setSelectedElementIds([])}
              onTap={() => setSelectedElementIds([])}
            />
          </Layer>
          <Layer>
            {activeDocument.elements.map((element) => {
              const isSelected = selectedElementIds.includes(element.id);

              if (element.type === "image") {
                return (
                  <ImageElement
                    key={element.id}
                    element={element}
                    src={assetUrlById.get(element.assetId)}
                    isSelected={isSelected}
                    onSelect={() => setSelectedElementIds([element.id])}
                    onDragEnd={(x, y) => {
                      void upsertElement(activeDocument.id, {
                        ...element,
                        x,
                        y,
                      });
                    }}
                  />
                );
              }

              if (element.type === "text") {
                return (
                  <TextElement
                    key={element.id}
                    element={element}
                    isSelected={isSelected}
                    onSelect={() => setSelectedElementIds([element.id])}
                    onDragEnd={(x, y) => {
                      void upsertElement(activeDocument.id, {
                        ...element,
                        x,
                        y,
                      });
                    }}
                  />
                );
              }

              return (
                <ShapeElement
                  key={element.id}
                  element={element}
                  isSelected={isSelected}
                  onSelect={() => setSelectedElementIds([element.id])}
                  onDragEnd={(x, y) => {
                    void upsertElement(activeDocument.id, {
                      ...element,
                      x,
                      y,
                    });
                  }}
                />
              );
            })}
            <Transformer ref={transformerRef} rotateEnabled borderStroke="#38bdf8" />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
