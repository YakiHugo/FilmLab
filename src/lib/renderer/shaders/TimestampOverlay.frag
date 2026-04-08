#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D u_glyphAtlas;
uniform vec2 u_canvasSize;
uniform vec4 u_rect;
uniform vec2 u_textStart;
uniform vec2 u_cellSize;
uniform vec2 u_glyphAtlasGrid;
uniform vec4 u_backgroundColor;
uniform vec4 u_textColor;
uniform int u_charCount;
uniform int u_glyphCount;
uniform float u_glyphIndices[64];

vec4 sourceOver(vec4 base, vec4 layer) {
  float outAlpha = layer.a + base.a * (1.0 - layer.a);
  if (outAlpha <= 1e-5) {
    return vec4(0.0);
  }

  vec3 outRgb =
    (layer.rgb * layer.a + base.rgb * base.a * (1.0 - layer.a)) / outAlpha;
  return vec4(clamp(outRgb, 0.0, 1.0), clamp(outAlpha, 0.0, 1.0));
}

bool isInsideRect(vec2 pixel, vec4 rect) {
  return
    pixel.x >= rect.x &&
    pixel.y >= rect.y &&
    pixel.x < rect.x + rect.z &&
    pixel.y < rect.y + rect.w;
}

float resolveGlyphMask(vec2 pixel) {
  vec2 local = pixel - u_textStart;
  if (
    local.x < 0.0 ||
    local.y < 0.0 ||
    local.y >= u_cellSize.y ||
    local.x >= u_cellSize.x * float(max(u_charCount, 0))
  ) {
    return 0.0;
  }

  int cellIndex = int(floor(local.x / max(u_cellSize.x, 1.0)));
  if (cellIndex < 0 || cellIndex >= u_charCount || cellIndex >= 64) {
    return 0.0;
  }

  float glyphIndexValue = u_glyphIndices[cellIndex];
  if (glyphIndexValue < 0.0) {
    return 0.0;
  }

  int glyphIndex = int(floor(glyphIndexValue + 0.5));
  if (glyphIndex < 0 || glyphIndex >= u_glyphCount) {
    return 0.0;
  }

  int atlasColumns = max(int(floor(u_glyphAtlasGrid.x + 0.5)), 1);
  vec2 glyphLocalUv = vec2(
    fract(local.x / max(u_cellSize.x, 1.0)),
    clamp(local.y / max(u_cellSize.y, 1.0), 0.0, 0.9999)
  );
  vec2 atlasOrigin = vec2(float(glyphIndex % atlasColumns), float(glyphIndex / atlasColumns));
  vec2 atlasUv = (atlasOrigin + glyphLocalUv) / max(u_glyphAtlasGrid, vec2(1.0));

  return texture(u_glyphAtlas, atlasUv).r;
}

void main() {
  vec2 pixel = vTextureCoord * u_canvasSize;
  vec4 color = vec4(0.0);

  if (isInsideRect(pixel, u_rect)) {
    color = u_backgroundColor;
  }

  float glyphMask = resolveGlyphMask(pixel);
  if (glyphMask > 0.001) {
    color = sourceOver(color, vec4(u_textColor.rgb, u_textColor.a * glyphMask));
  }

  outColor = color;
}
