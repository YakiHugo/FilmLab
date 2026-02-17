// ---- Layer 2: Color Matrix ----

vec3 applyColorMatrix(vec3 color) {
  if (!u_colorMatrixEnabled) return color;
  color = u_colorMatrix * color;
  return clamp(color, 0.0, 1.0);
}
