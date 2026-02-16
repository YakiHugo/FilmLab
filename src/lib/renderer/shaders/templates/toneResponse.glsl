// ---- Layer 1: Film tone response curve ----

vec3 applyToneResponse(vec3 color) {
  if (!u_toneEnabled) return color;

  // Filmic S-curve: shoulder controls highlight compression, toe controls shadow lift
  color = pow(max(color, vec3(0.0)), vec3(u_gamma));

  // Shoulder: soft-clip highlights
  vec3 shoulderCurve = 1.0 - exp(-color / max(u_shoulder, 0.01));
  color = mix(color, shoulderCurve, u_shoulder);

  // Toe: lift shadows
  vec3 toeCurve = pow(max(color, vec3(0.0)), vec3(1.0 - u_toe * 0.5));
  color = mix(color, toeCurve, u_toe);

  return clamp(color, 0.0, 1.0);
}
