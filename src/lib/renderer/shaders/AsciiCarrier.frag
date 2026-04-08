#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_backgroundCanvas;
uniform sampler2D u_glyphAtlas;
uniform vec2 u_canvasSize;
uniform vec2 u_gridSize;
uniform vec2 u_cellSize;
uniform vec2 u_glyphAtlasGrid;
uniform vec4 u_backgroundFill;
uniform vec4 u_cellBackgroundColor;
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
  return texelFetch(uSampler, clampCellCoord(cellCoord), 0);
}

float resolveEdge(ivec2 cellCoord) {
  float left = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x - 1, cellCoord.y)).rgb);
  float right = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x + 1, cellCoord.y)).rgb);
  float up = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x, cellCoord.y - 1)).rgb);
  float down = asciiResolveLuminance(sampleCell(ivec2(cellCoord.x, cellCoord.y + 1)).rgb);
  return clamp(abs(right - left) + abs(down - up), 0.0, 1.0);
}

float resolveTone(ivec2 cellCoord, vec4 cellSample) {
  if (cellSample.a <= ASCII_ALPHA_CUTOFF) {
    return 0.0;
  }

  float tone = asciiResolveLuminance(cellSample.rgb);
  if (u_invert) {
    tone = 1.0 - tone;
  }
  tone = clamp((tone - 0.5) * u_contrast + 0.5 + u_brightness / 100.0, 0.0, 1.0);
  tone = clamp(tone + resolveEdge(cellCoord) * u_edgeEmphasis, 0.0, 1.0);
  tone = pow(tone, 1.0 / max(u_density, 0.0001));

  float coverageThreshold = 1.0 - u_coverage;
  if (tone <= coverageThreshold) {
    return 0.0;
  }
  return clamp(
    (tone - coverageThreshold) / max(0.0001, 1.0 - coverageThreshold),
    0.0,
    1.0
  );
}

vec3 resolveForegroundColor(vec4 cellSample, float tone) {
  if (u_colorMode > 1.5) {
    return mix(u_cellBackgroundColor.rgb, ASCII_GRAYSCALE_HIGHLIGHT, clamp(tone, 0.0, 1.0));
  }
  if (u_colorMode > 0.5) {
    return clamp(cellSample.rgb, 0.0, 1.0);
  }
  return ASCII_GRAYSCALE_HIGHLIGHT;
}

vec4 resolveBackgroundLayer(ivec2 cellCoord, vec4 cellSample) {
  vec4 color = vec4(0.0);
  if (u_useBackgroundCanvas) {
    color = texture(u_backgroundCanvas, vTextureCoord);
  } else if (u_useBackgroundFill) {
    color = u_backgroundFill;
  }
  if (u_useCellBackground && cellSample.a > ASCII_ALPHA_CUTOFF) {
    vec4 cellBackground = vec4(
      u_cellBackgroundColor.rgb,
      clamp(u_cellBackgroundColor.a * cellSample.a, 0.0, 1.0)
    );
    color = asciiSourceOver(color, cellBackground);
  }
  return color;
}

vec4 resolveForegroundLayer(vec2 pixel, ivec2 cellCoord, vec2 localUv, vec4 cellSample, float tone) {
  vec4 color = vec4(0.0);
  if (tone > 0.001 && cellSample.a > ASCII_ALPHA_CUTOFF) {
    vec3 foregroundColor = resolveForegroundColor(cellSample, tone);
    float foregroundAlpha =
      clamp(u_foregroundOpacity, 0.0, 1.0) *
      max(0.12, tone) *
      clamp(cellSample.a, 0.0, 1.0);

    if (u_renderMode > 0.5) {
      float dotRadius =
        max(1.0, min(u_cellSize.x, u_cellSize.y) * 0.45 * clamp(tone, 0.0, 1.0));
      vec2 centered = localUv * u_cellSize - u_cellSize * 0.5;
      float distanceFromCenter = length(centered);
      float dotAlpha =
        1.0 - smoothstep(max(dotRadius - 1.0, 0.0), dotRadius, distanceFromCenter);
      color = vec4(foregroundColor, foregroundAlpha * dotAlpha);
    } else {
      float glyphSteps = max(1.0, u_glyphCount - 1.0);
      float glyphIndex = round(clamp(tone, 0.0, 1.0) * glyphSteps);
      float atlasColumn = mod(glyphIndex, u_glyphAtlasGrid.x);
      float atlasRow = floor(glyphIndex / max(u_glyphAtlasGrid.x, 1.0));
      vec2 atlasUv =
        (vec2(atlasColumn, atlasRow) + localUv) / max(u_glyphAtlasGrid, vec2(1.0));
      float glyphAlpha = texture(u_glyphAtlas, atlasUv).a;
      color = vec4(foregroundColor, foregroundAlpha * glyphAlpha);
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
