import { useEffect, useRef } from "react";
import type { WaveformData } from "./waveform";

interface EditorWaveformProps {
  waveform: WaveformData | null;
}

export function EditorWaveform({ waveform }: EditorWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || 320;
    const displayHeight = canvas.clientHeight || 120;
    const targetWidth = Math.max(1, Math.round(displayWidth * devicePixelRatio));
    const targetHeight = Math.max(1, Math.round(displayHeight * devicePixelRatio));
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(15, 23, 42, 0.8)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!waveform) {
      return;
    }

    const cellWidth = canvas.width / waveform.width;
    const cellHeight = canvas.height / waveform.height;
    for (let row = 0; row < waveform.height; row += 1) {
      for (let column = 0; column < waveform.width; column += 1) {
        const value = waveform.values[row * waveform.width + column] ?? 0;
        if (value <= 0.001) {
          continue;
        }
        const alpha = Math.min(0.92, Math.max(0.08, value));
        context.fillStyle = `rgba(248, 250, 252, ${alpha})`;
        context.fillRect(column * cellWidth, row * cellHeight, cellWidth + 0.75, cellHeight + 0.75);
      }
    }
  }, [waveform]);

  if (!waveform) {
    return (
      <div className="flex h-20 w-full items-center justify-center text-xs text-slate-500">
        暂无波形图
      </div>
    );
  }

  return (
    <div className="h-20 w-full overflow-hidden rounded-md border border-white/5 bg-[#0b0f13]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-label="Luminance waveform"
        role="img"
      />
    </div>
  );
}
