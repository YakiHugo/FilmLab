#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler; // base (linear)
uniform sampler2D u_layer;  // layer (linear)
uniform sampler2D u_mask;   // optional alpha mask
uniform float u_opacity;    // [0, 1]
uniform int u_blendMode;    // 0 normal, 1 multiply, 2 screen, 3 overlay, 4 softLight
uniform bool u_useMask;
uniform bool u_invertMask;

vec3 blendMultiply(vec3 base, vec3 blend) {
  return base * blend;
}

vec3 blendScreen(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(0.5, base)
  );
}

vec3 blendSoftLight(vec3 base, vec3 blend) {
  vec3 d = mix(
    ((16.0 * base - 12.0) * base + 4.0) * base,
    sqrt(base),
    step(0.25, base)
  );
  return mix(
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    base + (2.0 * blend - 1.0) * (d - base),
    step(0.5, blend)
  );
}

vec3 resolveBlendColor(vec3 base, vec3 blend) {
  if (u_blendMode == 1) {
    return blendMultiply(base, blend);
  }
  if (u_blendMode == 2) {
    return blendScreen(base, blend);
  }
  if (u_blendMode == 3) {
    return blendOverlay(base, blend);
  }
  if (u_blendMode == 4) {
    return blendSoftLight(base, blend);
  }
  return blend;
}

float resolveMaskAlpha(vec2 uv) {
  if (!u_useMask) {
    return 1.0;
  }
  float alpha = clamp(texture(u_mask, uv).a, 0.0, 1.0);
  return u_invertMask ? 1.0 - alpha : alpha;
}

void main() {
  vec4 base = texture(uSampler, vTextureCoord);
  vec4 layer = texture(u_layer, vTextureCoord);
  float maskAlpha = resolveMaskAlpha(vTextureCoord);
  float blendFactor = clamp(u_opacity, 0.0, 1.0) * maskAlpha * clamp(layer.a, 0.0, 1.0);

  vec3 blendColor = resolveBlendColor(base.rgb, layer.rgb);
  vec3 color = mix(base.rgb, blendColor, blendFactor);
  float alpha = base.a + blendFactor * (1.0 - base.a);

  outColor = vec4(clamp(color, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
