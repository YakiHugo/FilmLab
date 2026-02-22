// ---- Layer 6: Vignette ----

vec3 applyVignette(vec3 color) {
  if (!u_vignetteEnabled || abs(u_vignetteAmount) < 0.001) return color;

  vec2 center = vTextureCoord - 0.5;
  // roundness controls ellipse shape
  float aspect = 1.0; // TODO: pass actual aspect ratio via uniform
  center.x *= mix(1.0, aspect, u_vignetteRoundness);

  float dist = length(center) * 2.0;
  float edge = smoothstep(u_vignetteMidpoint, 1.0, dist);

  if (u_vignetteAmount > 0.0) {
    color *= 1.0 - edge * edge * u_vignetteAmount;
  } else {
    color += vec3(edge * edge * abs(u_vignetteAmount) * 0.35);
  }

  return clamp(color, 0.0, 1.0);
}
