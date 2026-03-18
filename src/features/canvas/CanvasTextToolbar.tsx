import {
  useCallback,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import type { CanvasTextElement, CanvasTextFontSizeTier } from "@/types";
import { cn } from "@/lib/utils";
import {
  CANVAS_TEXT_COLOR_OPTIONS,
  CANVAS_TEXT_FONT_OPTIONS,
  CANVAS_TEXT_MENU_ITEM_HEIGHT,
  CANVAS_TEXT_MENU_PADDING,
  CANVAS_TEXT_MENU_WIDTHS,
  CANVAS_TEXT_SIZE_TIER_OPTIONS,
  getCanvasTextColorOption,
  getCanvasTextFontOption,
  getCanvasTextSizeTierOption,
} from "./textStyle";
import { resolveToolbarMenuPlacement } from "./overlayGeometry";

type ToolbarMenu = "color" | "font" | "size" | null;
const TOOLBAR_MENU_GAP = 10;

export interface CanvasTextToolbarProps {
  element: CanvasTextElement;
  onColorChange: (value: string) => void;
  onFontFamilyChange: (value: string) => void;
  onFontSizeTierChange: (value: CanvasTextFontSizeTier) => void;
  position: {
    left: number;
    top: number;
  };
}

export const CanvasTextToolbar = forwardRef<HTMLDivElement, CanvasTextToolbarProps>(
  function CanvasTextToolbar(
    { element, onColorChange, onFontFamilyChange, onFontSizeTierChange, position },
    forwardedRef
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null);
    const [metrics, setMetrics] = useState({
      containerHeight: 0,
      containerWidth: 0,
      height: 0,
      width: 0,
    });

    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
          return;
        }
        if (forwardedRef) {
          (forwardedRef as { current: HTMLDivElement | null }).current = node;
        }
      },
      [forwardedRef]
    );

    useLayoutEffect(() => {
      const measure = () => {
        const node = rootRef.current;
        if (!node) {
          return;
        }

        const parent = node.offsetParent as HTMLElement | null;
        if (!parent) {
          return;
        }

        const rootRect = node.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        setMetrics((current) => {
          const next = {
            containerHeight: Math.round(parentRect.height),
            containerWidth: Math.round(parentRect.width),
            height: Math.round(rootRect.height),
            width: Math.round(rootRect.width),
          };

          return current.containerHeight === next.containerHeight &&
            current.containerWidth === next.containerWidth &&
            current.height === next.height &&
            current.width === next.width
            ? current
            : next;
        });
      };

      measure();

      const node = rootRef.current;
      const parent = node?.offsetParent as HTMLElement | null;
      if (!node || !parent) {
        return;
      }

      const handleResize = () => measure();
      window.addEventListener("resize", handleResize);

      if (typeof ResizeObserver === "undefined") {
        return () => {
          window.removeEventListener("resize", handleResize);
        };
      }

      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(node);
      observer.observe(parent);

      return () => {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      };
    }, [position.left, position.top, openMenu]);

    useEffect(() => {
      if (!openMenu) {
        return;
      }

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }
        if (rootRef.current?.contains(target)) {
          return;
        }
        setOpenMenu(null);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          setOpenMenu(null);
        }
      };

      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("keydown", handleKeyDown, true);

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [openMenu]);

    const selectedColor = useMemo(() => getCanvasTextColorOption(element.color), [element.color]);
    const selectedFont = useMemo(
      () => getCanvasTextFontOption(element.fontFamily),
      [element.fontFamily]
    );
    const selectedSizeTier = useMemo(
      () => getCanvasTextSizeTierOption(element.fontSizeTier),
      [element.fontSizeTier]
    );
    const selectedFontOptions = useMemo(() => {
      const current = getCanvasTextFontOption(element.fontFamily);
      return CANVAS_TEXT_FONT_OPTIONS.some((option) => option.value === current.value)
        ? CANVAS_TEXT_FONT_OPTIONS
        : [...CANVAS_TEXT_FONT_OPTIONS, current];
    }, [element.fontFamily]);

    const menuPlacement = useMemo(() => {
      if (!openMenu) {
        return null;
      }

      const toolbarRect = {
        height: metrics.height || 48,
        width: metrics.width || 196,
        x: position.left,
        y: position.top,
      };

      if (openMenu === "color") {
        return resolveToolbarMenuPlacement({
          containerHeight: metrics.containerHeight || window.innerHeight,
          containerWidth: metrics.containerWidth || window.innerWidth,
          gap: TOOLBAR_MENU_GAP,
          menuHeight:
            CANVAS_TEXT_COLOR_OPTIONS.length * CANVAS_TEXT_MENU_ITEM_HEIGHT +
            CANVAS_TEXT_MENU_PADDING * 2,
          menuWidth: CANVAS_TEXT_MENU_WIDTHS.color,
          padding: 8,
          toolbarRect,
        });
      }

      if (openMenu === "font") {
        return resolveToolbarMenuPlacement({
          containerHeight: metrics.containerHeight || window.innerHeight,
          containerWidth: metrics.containerWidth || window.innerWidth,
          gap: TOOLBAR_MENU_GAP,
          menuHeight:
            selectedFontOptions.length * CANVAS_TEXT_MENU_ITEM_HEIGHT +
            CANVAS_TEXT_MENU_PADDING * 2,
          menuWidth: CANVAS_TEXT_MENU_WIDTHS.font,
          padding: 8,
          toolbarRect,
        });
      }

      return resolveToolbarMenuPlacement({
        containerHeight: metrics.containerHeight || window.innerHeight,
        containerWidth: metrics.containerWidth || window.innerWidth,
        gap: TOOLBAR_MENU_GAP,
        menuHeight:
          CANVAS_TEXT_SIZE_TIER_OPTIONS.length * CANVAS_TEXT_MENU_ITEM_HEIGHT +
          CANVAS_TEXT_MENU_PADDING * 2,
        menuWidth: CANVAS_TEXT_MENU_WIDTHS.size,
        padding: 8,
        toolbarRect,
      });
    }, [
      metrics.containerHeight,
      metrics.containerWidth,
      metrics.height,
      metrics.width,
      openMenu,
      position.left,
      position.top,
      selectedFontOptions,
    ]);
    const menuPositionStyle = useMemo(() => {
      if (!menuPlacement) {
        return {};
      }

      return {
        ...(menuPlacement.align === "right" ? { right: 0 } : { left: 0 }),
        ...(menuPlacement.side === "top"
          ? { bottom: `calc(100% + ${TOOLBAR_MENU_GAP}px)` }
          : { top: `calc(100% + ${TOOLBAR_MENU_GAP}px)` }),
      } as const;
    }, [menuPlacement]);

    const menuScrollStyle = useMemo(() => {
      if (!menuPlacement) {
        return {};
      }

      return {
        maxHeight: `${menuPlacement.maxHeight}px`,
      } as const;
    }, [menuPlacement]);

    return (
      <div
        ref={setRootRef}
        className="absolute z-30"
        style={{
          left: position.left,
          top: position.top,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-1 rounded-[6px] border border-white/10 bg-black/90 p-1.5 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <ToolbarMenuButton
            active={openMenu === "color"}
            menu={
              openMenu === "color" ? (
                <div
                  className="absolute w-[180px] overflow-hidden rounded-[6px] border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl"
                  style={menuPositionStyle}
                >
                  <div className="overflow-y-auto p-1" style={menuScrollStyle}>
                    {CANVAS_TEXT_COLOR_OPTIONS.map((option) => {
                      const selected = option.value === selectedColor.value;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onColorChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <ColorSwatch value={option.value} />
                          <span>{option.label}</span>
                          <span className="ml-auto flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            }
            onToggle={() => setOpenMenu((current) => (current === "color" ? null : "color"))}
          >
            <ColorSwatch value={selectedColor.value} />
          </ToolbarMenuButton>

          <ToolbarMenuButton
            active={openMenu === "font"}
            menu={
              openMenu === "font" ? (
                <div
                  className="absolute min-w-[160px] overflow-hidden rounded-[6px] border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl"
                  style={menuPositionStyle}
                >
                  <div className="overflow-y-auto p-1" style={menuScrollStyle}>
                    {selectedFontOptions.map((option) => {
                      const selected = option.value === selectedFont.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onFontFamilyChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <span style={{ fontFamily: option.value }}>{option.label}</span>
                          <span className="ml-auto flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            }
            onToggle={() => setOpenMenu((current) => (current === "font" ? null : "font"))}
          >
            <span className="min-w-[1.75rem] text-center text-sm font-semibold tracking-[0.02em]">
              Aa
            </span>
          </ToolbarMenuButton>

          <ToolbarMenuButton
            active={openMenu === "size"}
            menu={
              openMenu === "size" ? (
                <div
                  className="absolute min-w-[160px] overflow-hidden rounded-[6px] border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl"
                  style={menuPositionStyle}
                >
                  <div className="overflow-y-auto p-1" style={menuScrollStyle}>
                    {CANVAS_TEXT_SIZE_TIER_OPTIONS.map((option) => {
                      const selected = option.value === selectedSizeTier.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onFontSizeTierChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <span>{option.label}</span>
                          <span className="ml-auto flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            }
            onToggle={() => setOpenMenu((current) => (current === "size" ? null : "size"))}
          >
            <span className="min-w-[1.75rem] text-center text-sm font-semibold tracking-[0.02em]">
              A↑
            </span>
          </ToolbarMenuButton>
        </div>
      </div>
    );
  }
);

interface ToolbarMenuButtonProps {
  active: boolean;
  children: ReactNode;
  menu: ReactNode;
  onToggle: () => void;
}

function ToolbarMenuButton({ active, children, menu, onToggle }: ToolbarMenuButtonProps) {
  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex h-9 min-w-9 items-center justify-center gap-1 rounded-[6px] px-2 text-zinc-100 transition hover:bg-white/10",
          active && "bg-white/10"
        )}
        onClick={onToggle}
      >
        {children}
        <ChevronDown className="h-3 w-3 text-zinc-400" />
      </button>
      {menu}
    </div>
  );
}

function ColorSwatch({ value }: { value: string }) {
  const isBlack = value.toLowerCase() === "#000000";

  return (
    <span
      className={cn("h-4 w-4 rounded-full border", isBlack ? "border-white/25" : "border-black/10")}
      style={{ backgroundColor: value }}
    />
  );
}
