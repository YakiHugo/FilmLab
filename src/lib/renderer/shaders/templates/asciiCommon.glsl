// Shared ASCII cell-grid helpers used by both AsciiCarrier and AsciiTextmode shaders.
// Injected via ProgramRegistry at program creation time.

const float ASCII_ALPHA_CUTOFF = 0.05;
const vec3 ASCII_GRAYSCALE_HIGHLIGHT = vec3(245.0 / 255.0);

vec4 asciiSourceOver(vec4 base, vec4 layer) {
  float outAlpha = layer.a + base.a * (1.0 - layer.a);
  if (outAlpha <= 1e-5) {
    return vec4(0.0);
  }

  vec3 outRgb =
    (layer.rgb * layer.a + base.rgb * base.a * (1.0 - layer.a)) / outAlpha;
  return vec4(clamp(outRgb, 0.0, 1.0), clamp(outAlpha, 0.0, 1.0));
}

ivec2 asciiResolveCellCoord(vec2 pixel, vec2 canvasSize, vec2 cellSize, vec2 gridSize) {
  vec2 safePixel = clamp(pixel, vec2(0.0), canvasSize - vec2(0.0001));
  vec2 gridCoord = floor(safePixel / max(cellSize, vec2(1.0)));
  return ivec2(clamp(gridCoord, vec2(0.0), max(gridSize - vec2(1.0), vec2(0.0))));
}

vec2 asciiResolveCellLocalUv(vec2 pixel, vec2 canvasSize, vec2 cellSize) {
  vec2 safePixel = clamp(pixel, vec2(0.0), canvasSize - vec2(0.0001));
  return fract(safePixel / max(cellSize, vec2(1.0)));
}

float asciiResolveGridOverlayMask(vec2 pixel, vec2 cellSize, bool gridOverlay) {
  if (!gridOverlay) {
    return 0.0;
  }
  vec2 safeCellSize = max(cellSize, vec2(1.0));
  vec2 local = mod(pixel, safeCellSize);
  float distX = min(local.x, safeCellSize.x - local.x);
  float distY = min(local.y, safeCellSize.y - local.y);
  float vertical = 1.0 - step(1.0, distX);
  float horizontal = 1.0 - step(1.0, distY);
  return max(vertical, horizontal);
}

float asciiResolveLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
