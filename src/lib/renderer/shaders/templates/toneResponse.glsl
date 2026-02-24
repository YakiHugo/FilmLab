// ---- Layer 1: Film tone response curve ----

// Apply the filmic curve on luminance and re-scale RGB to preserve hue.
// Shoulder compresses highlights via a Reinhard-style rational curve.
// Toe lifts shadows via a complementary power curve.
// Gamma adjusts the midpoint pivot (overall density).
// All operations are continuous and branchless (except the enable guard).

float toneChannel(float x, float shoulder, float toe, float gamma) {
  // Gamma pivot — adjusts midtone density
  x = pow(max(x, 0.0), gamma);

  // Shoulder: Reinhard-style highlight compression
  // f(x) = x*(1+k) / (x+k), where k = shoulder*2
  // At shoulder=0 k=0 so f(x)=x (identity). At shoulder=1 k=2 so f(1)=1, f(0.5)≈0.75.
  // We blend toward the compressed curve by `shoulder` to keep low values gentle.
  float k = shoulder * 2.0;
  float compressed = x * (1.0 + k) / (x + k + 0.0001);
  x = mix(x, compressed, shoulder);

  // Toe: shadow lift via power curve
  // f(x) = x^(1/(1+toe)) — lifts dark values toward midtones.
  // At toe=0 exponent=1 (identity). At toe=1 exponent=0.5 (sqrt).
  float toeGamma = 1.0 / (1.0 + toe);
  float lifted = pow(max(x, 0.0), toeGamma);
  x = mix(x, lifted, toe);

  return clamp(x, 0.0, 1.0);
}

vec3 applyToneResponse(vec3 color) {
  if (!u_toneEnabled) return color;

  float lum = luminance(color);
  float mappedLum = toneChannel(lum, u_shoulder, u_toe, u_gamma);
  if (lum <= 1e-5) {
    return vec3(mappedLum);
  }

  float ratio = mappedLum / lum;
  color *= ratio;
  return clamp(color, 0.0, 1.0);
}
