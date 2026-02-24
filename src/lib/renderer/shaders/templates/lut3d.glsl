// ---- Layer 3: 3D LUT sampling ----

vec3 applyLUT(vec3 color) {
  if (!u_lutEnabled || u_lutIntensity <= 0.0) return color;
  vec3 clamped = clamp(color, 0.0, 1.0);
  float lutSize = float(textureSize(u_lut, 0).x);
  vec3 uvw = (clamped * (lutSize - 1.0) + 0.5) / lutSize;
  vec3 lutColor = texture(u_lut, uvw).rgb;
  return mix(color, lutColor, u_lutIntensity);
}
