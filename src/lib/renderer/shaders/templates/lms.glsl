// ---- LMS (CAT02 chromatic adaptation) ----

const mat3 RGB_TO_LMS = mat3(
   0.7328, 0.4296, -0.1624,
  -0.7036, 1.6975,  0.0061,
   0.0030, 0.0136,  0.9834
);
const mat3 LMS_TO_RGB = mat3(
   1.0961, -0.2789, 0.1827,
   0.4544,  0.4735, 0.0721,
  -0.0096, -0.0057, 1.0153
);

vec3 whiteBalanceLMS(vec3 linearRgb, float temp, float tintVal) {
  vec3 lms = RGB_TO_LMS * linearRgb;
  // Temperature: adjust L (long-wave/red) and S (short-wave/blue) channels
  float t = temp * 0.10;
  lms.x *= (1.0 + t);
  lms.z *= (1.0 - t);
  // Tint: adjust M (medium-wave/green) channel
  lms.y *= (1.0 + tintVal * 0.05);
  return LMS_TO_RGB * lms;
}
