#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

// Per-cell source color + alpha (RGBA8, columns × rows).
uniform sampler2D u_cellColor;
// Per-cell pre-computed tone in [0, 1] (R8, columns × rows). CPU applies
// brightness/contrast/density/coverage/invert/edge/dither before upload —
// the shader just maps tone to glyph index or dot radius.
uniform sampler2D u_cellTone;
// Optional blurred/solid background layer matching canvas size.
uniform sampler2D u_backgroundCanvas;
uniform sampler2D u_glyphAtlas;

uniform vec2 u_canvasSize;
uniform vec2 u_gridSize;
uniform vec2 u_cellSize;
uniform vec2 u_glyphAtlasGrid;
uniform vec4 u_backgroundFill;
uniform vec4 u_cellBackgroundColor;
uniform vec4 u_duotoneShadow;
uniform float u_glyphCount;
uniform float u_layerMode;        // 0 = background pass, 1 = foreground pass
uniform float u_renderMode;       // 0 = glyph, 1 = dot
uniform float u_colorMode;        // 0 = grayscale, 1 = full-color, 2 = duotone
uniform float u_foregroundOpacity;
uniform float u_backgroundOpacity;
uniform bool u_invert;
uniform bool u_useBackgroundCanvas;
uniform bool u_useBackgroundFill;
uniform bool u_useCellBackground;
uniform bool u_gridOverlay;
uniform float u_gridOverlayAlpha;

// #ASCII_COMMON#

ivec2 clampCellCoord(ivec2 cellCoord) {
  return ivec2(clamp(vec2(cellCoord), vec2(0.0), max(u_gridSize - vec2(1.0), vec2(0.0))));
}

vec4 sampleCellColor(ivec2 cellCoord) {
  return texelFetch(u_cellColor, clampCellCoord(cellCoord), 0);
}

float sampleCellTone(ivec2 cellCoord) {
  return texelFetch(u_cellTone, clampCellCoord(cellCoord), 0).r;
}

vec3 resolveForegroundColor(vec4 cellSample, float tone) {
  // Duotone: shadow → highlight gradient based on pre-invert source brightness.
  if (u_colorMode > 1.5) {
    float colorTone = u_invert ? 1.0 - tone : tone;
    return mix(u_duotoneShadow.rgb, ASCII_GRAYSCALE_HIGHLIGHT, clamp(colorTone, 0.0, 1.0));
  }
  // Full-color: use the cell's sampled source color.
  if (u_colorMode > 0.5) {
    return clamp(cellSample.rgb, 0.0, 1.0);
  }
  // Grayscale.
  return ASCII_GRAYSCALE_HIGHLIGHT;
}

vec4 resolveBackgroundLayer(ivec2 cellCoord, vec4 cellSample) {
  vec4 color = vec4(0.0);
  if (u_useBackgroundCanvas) {
    vec4 bg = texture(u_backgroundCanvas, vTextureCoord);
    color = vec4(bg.rgb, bg.a * u_backgroundOpacity);
  } else if (u_useBackgroundFill) {
    color = u_backgroundFill;
  }
  if (u_useCellBackground && cellSample.a > ASCII_ALPHA_CUTOFF) {
    vec4 cellBg = vec4(
      u_cellBackgroundColor.rgb,
      clamp(u_cellBackgroundColor.a * cellSample.a, 0.0, 1.0)
    );
    color = asciiSourceOver(color, cellBg);
  }
  return color;
}

vec4 resolveForegroundLayer(vec2 pixel, vec2 localUv, vec4 cellSample, float tone) {
  vec4 color = vec4(0.0);
  if (tone > 0.0 && cellSample.a > ASCII_ALPHA_CUTOFF) {
    vec3 fg = resolveForegroundColor(cellSample, tone);
    float fgAlpha = clamp(u_foregroundOpacity, 0.0, 1.0) * clamp(cellSample.a, 0.0, 1.0);

    if (u_renderMode > 0.5) {
      // Dot mode — radius tracks pre-invert source brightness.
      float dotTone = u_invert ? 1.0 - clamp(tone, 0.0, 1.0) : clamp(tone, 0.0, 1.0);
      float dotRadius = max(1.0, min(u_cellSize.x, u_cellSize.y) * 0.45 * dotTone);
      vec2 centered = localUv * u_cellSize - u_cellSize * 0.5;
      float dist = length(centered);
      float dotAlpha = 1.0 - smoothstep(max(dotRadius - 1.0, 0.0), dotRadius, dist);
      color = vec4(fg, fgAlpha * dotAlpha);
    } else {
      // Glyph mode — tone maps linearly to atlas index.
      float glyphSteps = max(1.0, u_glyphCount - 1.0);
      float idx = round(clamp(tone, 0.0, 1.0) * glyphSteps);
      float col = mod(idx, u_glyphAtlasGrid.x);
      float row = floor(idx / max(u_glyphAtlasGrid.x, 1.0));
      vec2 atlasUv = (vec2(col, row) + localUv) / max(u_glyphAtlasGrid, vec2(1.0));
      float glyphAlpha = texture(u_glyphAtlas, atlasUv).a;
      color = vec4(fg, fgAlpha * glyphAlpha);
    }
  }

  float overlayMask = asciiResolveGridOverlayMask(pixel, u_cellSize, u_gridOverlay);
  if (overlayMask > 0.0) {
    vec4 overlay = vec4(1.0, 1.0, 1.0, clamp(u_gridOverlayAlpha, 0.0, 1.0) * overlayMask);
    color = asciiSourceOver(color, overlay);
  }
  return color;
}

void main() {
  vec2 pixel = vTextureCoord * u_canvasSize;
  ivec2 cellCoord = asciiResolveCellCoord(pixel, u_canvasSize, u_cellSize, u_gridSize);
  vec2 localUv = asciiResolveCellLocalUv(pixel, u_canvasSize, u_cellSize);
  vec4 cellSample = sampleCellColor(cellCoord);
  float tone = sampleCellTone(cellCoord);

  if (u_layerMode < 0.5) {
    outColor = resolveBackgroundLayer(cellCoord, cellSample);
    return;
  }

  outColor = resolveForegroundLayer(pixel, localUv, cellSample, tone);
}
