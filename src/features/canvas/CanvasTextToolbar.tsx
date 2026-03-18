import {
  useCallback,
  forwardRef,
  useEffect,
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
  CANVAS_TEXT_SIZE_TIER_OPTIONS,
  getCanvasTextColorOption,
  getCanvasTextFontOption,
  getCanvasTextSizeTierOption,
} from "./textStyle";

type ToolbarMenu = "color" | "font" | "size" | null;

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
          setOpenMenu(null);
        }
      };

      document.addEventListener("pointerdown", handlePointerDown, true);
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
        window.removeEventListener("keydown", handleKeyDown);
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

    return (
      <div
        ref={setRootRef}
        className="absolute z-20"
        style={{
          left: position.left,
          top: position.top,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-black/90 p-1.5 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <ToolbarMenuButton
            active={openMenu === "color"}
            menu={
              openMenu === "color" ? (
                <div className="absolute left-0 top-[calc(100%+10px)] w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl">
                  <div className="p-1">
                    {CANVAS_TEXT_COLOR_OPTIONS.map((option) => {
                      const selected = option.value === selectedColor.value;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onColorChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <span className="flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <ColorSwatch value={option.value} />
                          <span>{option.label}</span>
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
                <div className="absolute left-0 top-[calc(100%+10px)] min-w-[160px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl">
                  <div className="p-1">
                    {[
                      ...CANVAS_TEXT_FONT_OPTIONS,
                      ...(CANVAS_TEXT_FONT_OPTIONS.some(
                        (option) => option.value === selectedFont.value
                      )
                        ? []
                        : [selectedFont]),
                    ].map((option) => {
                      const selected = option.value === selectedFont.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onFontFamilyChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <span className="flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span style={{ fontFamily: option.value }}>{option.label}</span>
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
                <div className="absolute right-0 top-[calc(100%+10px)] min-w-[160px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.98)] backdrop-blur-xl">
                  <div className="p-1">
                    {CANVAS_TEXT_SIZE_TIER_OPTIONS.map((option) => {
                      const selected = option.value === selectedSizeTier.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/10",
                            selected && "bg-amber-200/12 text-zinc-50"
                          )}
                          onClick={() => {
                            onFontSizeTierChange(option.value);
                            setOpenMenu(null);
                          }}
                        >
                          <span className="flex h-4 w-4 items-center justify-center text-zinc-50">
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span>{option.label}</span>
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
          "flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl px-2 text-zinc-100 transition hover:bg-white/10",
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
