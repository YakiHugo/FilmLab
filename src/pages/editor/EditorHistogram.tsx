import { useMemo } from "react";
import type { HistogramData } from "./histogram";

const buildPath = (values: number[]) => {
  if (values.length === 0) {
    return "";
  }
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - value * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

const buildArea = (values: number[]) => {
  const line = buildPath(values);
  if (!line) {
    return "";
  }
  return `${line} L 100,100 L 0,100 Z`;
};

type HistogramPaths =
  | {
      mode: "rgb";
      r: {
        line: string;
        area: string;
      };
      g: {
        line: string;
        area: string;
      };
      b: {
        line: string;
        area: string;
      };
    }
  | {
      mode: "rgb-monochrome-overlap";
      mono: {
        line: string;
        area: string;
      };
    };

export function EditorHistogram({ histogram }: { histogram: HistogramData | null }) {
  const paths = useMemo<HistogramPaths | null>(() => {
    if (!histogram) {
      return null;
    }
    if (histogram.mode === "rgb-monochrome-overlap") {
      return {
        mode: "rgb-monochrome-overlap",
        mono: {
          line: buildPath(histogram.luma),
          area: buildArea(histogram.luma),
        },
      };
    }
    return {
      mode: "rgb",
      r: {
        line: buildPath(histogram.r),
        area: buildArea(histogram.r),
      },
      g: {
        line: buildPath(histogram.g),
        area: buildArea(histogram.g),
      },
      b: {
        line: buildPath(histogram.b),
        area: buildArea(histogram.b),
      },
    };
  }, [histogram]);

  if (!paths) {
    return (
      <div className="flex h-28 w-full items-center justify-center text-xs text-slate-500">
        暂无直方图
      </div>
    );
  }

  return (
    <div className="h-28 w-full">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="直方图"
      >
        {paths.mode === "rgb-monochrome-overlap" ? (
          <>
            <path d={paths.mono.area} fill="rgba(203,213,225,0.28)" />
            <path d={paths.mono.line} stroke="#cbd5e1" strokeWidth="1" fill="none" />
          </>
        ) : (
          <>
            <path d={paths.r.area} fill="rgba(248,113,113,0.25)" />
            <path d={paths.g.area} fill="rgba(52,211,153,0.25)" />
            <path d={paths.b.area} fill="rgba(96,165,250,0.25)" />
            <path d={paths.r.line} stroke="#f87171" strokeWidth="1" fill="none" />
            <path d={paths.g.line} stroke="#34d399" strokeWidth="1" fill="none" />
            <path d={paths.b.line} stroke="#60a5fa" strokeWidth="1" fill="none" />
          </>
        )}
      </svg>
    </div>
  );
}
