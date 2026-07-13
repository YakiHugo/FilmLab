import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Braces,
  Clipboard,
  FolderOpen,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importAssetFiles } from "@/lib/assetImport";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";
import { isSupportedImportFile } from "@/stores/currentUser/constants";
import type { Asset } from "@/types";

const SIGNAL_FIELD = [
  "010011  ASCIIGRID  110010",
  "▓▓▒░··  LUMA_SCAN  ··░▒▓▓",
  "A8F2C9  EDGE/MASK  24B01E",
  "••••••  DOT_MATRIX  ••••••",
  "101101  SIGNAL/SHIFT 001011",
  "██▓▒░·  FRAME_0001  ·░▒▓██",
];

const formatAssetMeta = (asset: Asset) => {
  const width = asset.metadata?.width;
  const height = asset.metadata?.height;
  if (width && height) {
    return `${width} × ${height}`;
  }
  return `${Math.max(1, Math.round(asset.size / 1024))} KB`;
};

function RecentAssetCard({
  asset,
  disabled,
  onSelect,
}: {
  asset: Asset;
  disabled: boolean;
  onSelect: (asset: Asset) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(asset)}
      className="group min-w-0 border-l border-white/15 pl-3 text-left transition disabled:cursor-wait disabled:opacity-50"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#111411]">
        <img
          src={asset.thumbnailUrl || asset.objectUrl}
          alt={asset.name}
          className="h-full w-full object-cover saturate-[0.78] transition duration-500 group-hover:scale-[1.025] group-hover:saturate-100"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
        <span className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#d9ff43]">
          open_asset
        </span>
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className="truncate text-zinc-300">{asset.name}</span>
        <span className="shrink-0 text-zinc-600">{formatAssetMeta(asset)}</span>
      </div>
    </button>
  );
}

export function StudioPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assets = useAssetStore((state) => state.assets);
  const isLoading = useAssetStore((state) => state.isLoading);
  const [isDragging, setIsDragging] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [status, setStatus] = useState("等待图像输入");
  const [error, setError] = useState<string | null>(null);

  const recentAssets = useMemo(
    () =>
      assets
        .slice()
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, 4),
    [assets]
  );

  const openAsset = useCallback(
    async (asset: Asset) => {
      setIsStarting(true);
      setError(null);
      setStatus("正在建立计算画布");
      try {
        const { createImageWorkbench } = await import("@/features/studio/createImageWorkbench");
        const { workbenchId } = await createImageWorkbench(asset);
        setStatus("输入已锁定，进入风格实验");
        await navigate({
          to: "/canvas/$workbenchId",
          params: { workbenchId },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法建立作品，请重试。");
        setStatus("输入失败");
      } finally {
        setIsStarting(false);
      }
    },
    [navigate]
  );

  const importAndOpen = useCallback(
    async (filesInput: File[] | FileList) => {
      if (isStarting) {
        return;
      }
      const imageFile = Array.from(filesInput).find(isSupportedImportFile);
      if (!imageFile) {
        setError("请选择 PNG、JPEG、WebP 或 AVIF 图像。");
        return;
      }

      setIsStarting(true);
      setError(null);
      setStatus("正在分析并写入素材库");
      try {
        const result = await importAssetFiles([imageFile]);
        const assetId = result.resolvedAssetIds[0];
        const asset = useAssetStore.getState().assets.find((candidate) => candidate.id === assetId);
        if (!asset) {
          throw new Error(result.errors[0] ?? "图像未能写入素材库。");
        }

        const { createImageWorkbench } = await import("@/features/studio/createImageWorkbench");
        setStatus("正在建立计算画布");
        const { workbenchId } = await createImageWorkbench(asset);
        await navigate({
          to: "/canvas/$workbenchId",
          params: { workbenchId },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "图像导入失败，请重试。");
        setStatus("输入失败");
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, navigate]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const imageFile = Array.from(event.clipboardData?.files ?? []).find(isSupportedImportFile);
      if (!imageFile || isStarting) {
        return;
      }
      event.preventDefault();
      void importAndOpen([imageFile]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importAndOpen, isStarting]);

  return (
    <div className="compute-grid h-full overflow-y-auto bg-[#090b09] text-zinc-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.avif"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) {
            void importAndOpen(event.target.files);
          }
          event.target.value = "";
        }}
      />

      <section className="mx-auto grid min-h-[620px] w-full max-w-[1600px] border-b border-white/10 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <div className="flex min-h-[540px] flex-col justify-between px-5 py-8 sm:px-8 sm:py-10 lg:min-h-[calc(100dvh-45px)] lg:px-12 lg:py-12 xl:px-16">
          <div>
            <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              <span>FilmLab / Visual Compute</span>
              <span className="text-[#d9ff43]">System ready_</span>
            </div>

            <div className="mt-14 max-w-3xl sm:mt-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#ff6b35]">
                Input channel 01
              </p>
              <h1 className="mt-5 max-w-[760px] text-[clamp(3.3rem,6.3vw,7.2rem)] font-semibold leading-[0.84] tracking-[-0.075em] text-[#f1f1e9]">
                图像进去
                <br />
                <span className="text-[#d9ff43]">系统语言出来</span>
              </h1>
              <p className="mt-7 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                从一张图片开始，把光影翻译成 ASCII、网点、信号偏移与语义标记。不是滤镜列表，
                而是一条可继续编辑、恢复和输出的计算视觉管线。
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div
              className={cn(
                "relative border border-white/15 bg-black/35 p-4 transition sm:p-5",
                isDragging && "border-[#d9ff43] bg-[#d9ff43]/[0.07]"
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (
                  !event.relatedTarget ||
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setIsDragging(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void importAndOpen(event.dataTransfer.files);
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#d9ff43]/50 text-[#d9ff43]">
                    {isStarting ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100">拖入图片，或从本地选择</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                      PNG / JPEG / WEBP / AVIF · 单张输入
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 bg-[#d9ff43] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#10120d] transition hover:bg-[#e5ff78] disabled:cursor-wait disabled:opacity-60"
                >
                  选择图片
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="mt-3 border-l border-[#ff6b35] pl-3 text-xs text-[#ff9671]"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border border-white/10 bg-black/30 px-3 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:flex-col sm:items-start">
              <Clipboard className="h-4 w-4 text-zinc-300" />
              <span>⌘V</span>
              <span>粘贴图像</span>
            </div>
          </div>
        </div>

        <div className="compute-scanlines relative min-h-[600px] overflow-hidden border-t border-white/10 bg-[#0d100d] p-5 sm:p-8 lg:min-h-[calc(100dvh-45px)] lg:border-l lg:border-t-0 lg:p-10">
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <span>Signal preview</span>
              <span>001 / live</span>
            </div>

            <div className="my-auto py-12">
              <div className="border border-white/15 bg-[#080a08]/85 p-4 shadow-[18px_18px_0_rgba(217,255,67,0.06)] sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span className="text-[#d9ff43]">Luma interpreter</span>
                  <Braces className="h-4 w-4 text-zinc-500" />
                </div>
                <pre className="mt-7 overflow-hidden font-mono text-[clamp(0.65rem,1.25vw,1rem)] leading-[2.05] tracking-[0.12em] text-zinc-300">
                  {SIGNAL_FIELD.join("\n")}
                </pre>

                <div className="mt-7 grid grid-cols-4 gap-1.5" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-7 border border-white/5",
                        index % 7 === 0
                          ? "bg-[#ff6b35]"
                          : index % 3 === 0
                            ? "bg-[#d9ff43]"
                            : "bg-zinc-800"
                      )}
                      style={{ opacity: 0.2 + ((index * 17) % 70) / 100 }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 border border-white/10 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              <span className="border-r border-white/10 p-3">ASCII_FIELD</span>
              <span className="border-r border-white/10 p-3">DOT_MATRIX</span>
              <span className="p-3">SIGNAL_SHIFT</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1600px] px-5 py-12 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#ff6b35]">
              Input channel 02
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
              从最近素材继续
            </h2>
          </div>
          <Link
            to="/library"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 transition hover:text-[#d9ff43]"
          >
            打开完整素材库 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-5 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="aspect-[4/3] animate-pulse bg-white/[0.04]" />
            ))}
          </div>
        ) : recentAssets.length > 0 ? (
          <div className="grid gap-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {recentAssets.map((asset) => (
              <RecentAssetCard
                key={asset.id}
                asset={asset}
                disabled={isStarting}
                onSelect={(selectedAsset) => void openAsset(selectedAsset)}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="my-6 flex min-h-40 w-full items-center justify-center gap-3 border border-dashed border-white/15 bg-white/[0.015] text-sm text-zinc-500 transition hover:border-[#d9ff43]/50 hover:text-zinc-200"
          >
            <ImagePlus className="h-5 w-5" />
            素材库为空，导入第一张图片
          </button>
        )}

        <div className="mt-8 grid border border-white/10 md:grid-cols-2">
          <Link
            to="/library"
            className="group flex min-h-32 items-center justify-between gap-5 p-5 transition hover:bg-white/[0.035] sm:p-7 md:border-r md:border-white/10"
          >
            <div className="flex items-center gap-4">
              <FolderOpen className="h-6 w-6 text-[#d9ff43]" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  Channel 03 / Library
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-200">浏览与整理全部素材</p>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-zinc-600 transition group-hover:text-[#d9ff43]" />
          </Link>
          <Link
            to="/assist"
            className="group flex min-h-32 items-center justify-between gap-5 border-t border-white/10 p-5 transition hover:bg-white/[0.035] sm:p-7 md:border-t-0"
          >
            <div className="flex items-center gap-4">
              <Sparkles className="h-6 w-6 text-[#ff6b35]" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  Channel 04 / AI
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-200">用提示词生成新的输入</p>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-zinc-600 transition group-hover:text-[#ff6b35]" />
          </Link>
        </div>

        <div className="mt-7 flex flex-col gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{status}</span>
          <span>input → style → overlay → ratio → export</span>
        </div>
      </section>
    </div>
  );
}
