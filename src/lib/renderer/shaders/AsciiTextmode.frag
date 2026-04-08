#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_backgroundCanvas;
uniform sampler2D u_cellForeground;
uniform sampler2D u_cellBackground;
uniform sampler2D u_cellGlyphIndex;
uniform sampler2D u_cellDotRadius;
uniform sampler2D u_glyphAtlas;
uniform vec2 u_canvasSize;
uniform vec2 u_gridSize;
uniform vec2 u_cellSize;
uniform vec2 u_glyphAtlasGrid;
uniform vec4 u_backgroundFill;
uniform float u_emptyGlyphIndex;
uniform float u_glyphCount;
uniform float u_layerMode;
uniform float u_renderMode;
uniform bool u_useBackgroundCanvas;
uniform bool u_useBackgroundFill;
uniform bool u_gridOverlay;
uniform float u_gridOverlayAlpha;

vec4 sourceOver(vec4 base, vec4 layer) {
  float outAlpha = layer.a + base.a * (1.0 - layer.a);
  if (outAlpha <= 1e-5) {
    return vec4(0.0);
  }

  vec3 outRgb =
    (layer.rgb * layer.a + base.rgb * base.a * (1.0 - layer.a)) / outAlpha;
  return vec4(clamp(outRgb, 0.0, 1.0), clamp(outAlpha, 0.0, 1.0));
}

ivec2 resolveCellCoord(vec2 pixel) {
  vec2 safePixel = clamp(pixel, vec2(0.0), u_canvasSize - vec2(0.0001));
  vec2 gridCoord = floor(safePixel / max(u_cellSize, vec2(1.0)));
  return ivec2(clamp(gridCoord, vec2(0.0), max(u_gridSize - vec2(1.0), vec2(0.0))));
}

vec2 resolveCellLocalUv(vec2 pixel) {
  vec2 safePixel = clamp(pixel, vec2(0.0), u_canvasSize - vec2(0.0001));
  return fract(safePixel / max(u_cellSize, vec2(1.0)));
}

float resolveGridOverlayMask(vec2 pixel) {
  if (!u_gridOverlay) {
    return 0.0;
  }
  vec2 safeCellSize = max(u_cellSize, vec2(1.0));
  vec2 local = mod(pixel, safeCellSize);
  float distX = min(local.x, safeCellSize.x - local.x);
  float distY = min(local.y, safeCellSize.y - local.y);
  float vertical = 1.0 - step(1.0, distX);
  float horizontal = 1.0 - step(1.0, distY);
  return max(vertical, horizontal);
}

vec4 resolveBackgroundLayer(ivec2 cellCoord) {
  vec4 color = vec4(0.0);
  if (u_useBackgroundCanvas) {
    color = texture(u_backgroundCanvas, vTextureCoord);
  } else if (u_useBackgroundFill) {
    color = u_backgroundFill;
  }
  vec4 cellBackground = texelFetch(u_cellBackground, cellCoord, 0);
  return sourceOver(color, cellBackground);
}

vec4 resolveForegroundLayer(vec2 pixel, ivec2 cellCoord, vec2 localUv) {
  vec4 foreground = texelFetch(u_cellForeground, cellCoord, 0);
  vec4 color = vec4(0.0);

  if (foreground.a > 1e-5) {
    if (u_renderMode > 0.5) {
      float dotRadius = round(texelFetch(u_cellDotRadius, cellCoord, 0).r * 255.0);
      vec2 centered = localUv * u_cellSize - u_cellSize * 0.5;
      float distanceFromCenter = length(centered);
      float dotAlpha = 1.0 - smoothstep(max(dotRadius - 1.0, 0.0), dotRadius, distanceFromCenter);
      color = vec4(foreground.rgb, foreground.a * dotAlpha);
    } else {
      float glyphIndex = round(texelFetch(u_cellGlyphIndex, cellCoord, 0).r * 255.0);
      if (glyphIndex < u_emptyGlyphIndex && glyphIndex < u_glyphCount) {
        float atlasColumn = mod(glyphIndex, u_glyphAtlasGrid.x);
        float atlasRow = floor(glyphIndex / max(u_glyphAtlasGrid.x, 1.0));
        vec2 atlasUv = (vec2(atlasColumn, atlasRow) + localUv) / max(u_glyphAtlasGrid, vec2(1.0));
        float glyphAlpha = texture(u_glyphAtlas, atlasUv).a;
        color = vec4(foreground.rgb, foreground.a * glyphAlpha);
      }
    }
  }

  float overlayMask = resolveGridOverlayMask(pixel);
  if (overlayMask > 0.0) {
    vec4 overlay = vec4(1.0, 1.0, 1.0, clamp(u_gridOverlayAlpha, 0.0, 1.0) * overlayMask);
    color = sourceOver(color, overlay);
  }
  return color;
}

void main() {
  vec2 pixel = vTextureCoord * u_canvasSize;
  ivec2 cellCoord = resolveCellCoord(pixel);
  vec2 localUv = resolveCellLocalUv(pixel);

  if (u_layerMode < 0.5) {
    outColor = resolveBackgroundLayer(cellCoord);
    return;
  }

  outColor = resolveForegroundLayer(pixel, cellCoord, localUv);
}
