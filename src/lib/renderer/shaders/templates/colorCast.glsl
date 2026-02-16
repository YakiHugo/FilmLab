// ---- Layer 4: Color Cast ----

vec3 applyColorCast(vec3 color) {
  if (!u_colorCastEnabled) return color;

  float lum = luminance(color);
  // Smooth masks for shadow / midtone / highlight regions
  float shMask = 1.0 - smoothstep(0.0, 0.4, lum);
  float hiMask = smoothstep(0.6, 1.0, lum);
  float midMask = 1.0 - shMask - hiMask;

  color += u_colorCastShadows * shMask
         + u_colorCastMidtones * midMask
         + u_colorCastHighlights * hiMask;

  return clamp(color, 0.0, 1.0);
}
