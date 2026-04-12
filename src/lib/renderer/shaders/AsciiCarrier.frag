#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_analysisGrid;
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
uniform float u_layerMode;
uniform float u_renderMode;
uniform float u_colorMode;
uniform float u_density;
uniform float u_coverage;
uniform float u_edgeEmphasis;
uniform float u_brightness;
uniform float u_contrast;
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

vec4 sampleCell(ivec2 cellCoord) {
  return texelFetch(u_analysisGrid, clampCellCoord(cellCoord), 0);
}

float resolveEdge(ivec2 cellCoord) {
  float left  = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x - 1, cellCoord.y)).rgb);
  float right = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x + 1, cellCoord.y)).rgb);
  float up    = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x, cellCoord.y - 1)).rgb);
  float down  = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x, cellCoord.y + 1)).rgb);
  return clamp(abs(right - left) + abs(down - up), 0.0, 1.0);
}

// Returns a tone value used for glyph selection:
//   0.0        = cell not visible (clipped by coverage or transparent)
//   [0.001, 1] = visible cell; maps linearly to glyph index
// With invert ON (ascii-magic style): low tone = dense glyph = bright source.
float resolveTone(ivec2 cellCoord, vec4 cellSample) {
  if (cellSample.a <= ASCII_ALPHA_CUTOFF) {
    return 0.0;
  }

  float brightness = asciiResolveLuminance(cellSample.rgb);
  brightness = clamp((brightness - 0.5) * u_contrast + 0.5 + u_brightness / 100.0, 0.0, 1.0);
  brightness = clamp(brightness + resolveEdge(cellCoord) * u_edgeEmphasis, 0.0, 1.0);
  brightness = pow(brightness, 1.0 / max(u_density, 0.0001));

  float coverageThreshold = 1.0 - u_coverage;
  if (brightness <= coverageThreshold) {
    return 0.0;
  }
  float tone = clamp(
    (brightness - coverageThreshold) / max(0.0001, 1.0 - coverageThreshold),
    0.0,
    1.0
  );

  if (u_invert) {
    tone = 1.0 - tone;
  }
  return max(tone, 0.001);
}

vec3 resolveForegroundColor(vec4 cellSample, float tone) {
  // Duotone: shadow → highlight gradient based on source brightness.
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

// Background layer: blurred/solid base dimmed by backgroundOpacity so that
// foreground characters have contrast against it.
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

vec4 resolveForegroundLayer(vec2 pixel, ivec2 cellCoord, vec2 localUv, vec4 cellSample, float tone) {
  vec4 color = vec4(0.0);
  if (tone > 0.0 && cellSample.a > ASCII_ALPHA_CUTOFF) {
    vec3 fg = resolveForegroundColor(cellSample, tone);
    float fgAlpha = clamp(u_foregroundOpacity, 0.0, 1.0) * clamp(cellSample.a, 0.0, 1.0);

    if (u_renderMode > 0.5) {
      // Dot mode — radius tracks source brightness.
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
  vec4 cellSample = sampleCell(cellCoord);

  if (u_layerMode < 0.5) {
    outColor = resolveBackgroundLayer(cellCoord, cellSample);
    return;
  }

  float tone = resolveTone(cellCoord, cellSample);
  outColor = resolveForegroundLayer(pixel, cellCoord, localUv, cellSample, tone);
}
