// ---- Layer 3: 3D LUT sampling ----

vec3 applyLUT(vec3 color) {
  if (!u_lutEnabled || u_lutIntensity <= 0.0) return color;
  vec3 lutColor = texture(u_lut, clamp(color, 0.0, 1.0)).rgb;
  return mix(color, lutColor, u_lutIntensity);
}
