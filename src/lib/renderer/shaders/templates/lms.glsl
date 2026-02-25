// ---- LMS (CAT02 chromatic adaptation) ----

// NOTE: GLSL mat3 constructor is column-major.
// Values below are laid out as columns so the matrix math matches
// the canonical CAT02 row-major coefficients.
const mat3 RGB_TO_LMS = mat3(
   0.7328, -0.7036, 0.0030,
   0.4296,  1.6975, 0.0136,
  -0.1624,  0.0061, 0.9834
);
const mat3 LMS_TO_RGB = mat3(
   1.0961,  0.4544, -0.0096,
  -0.2789,  0.4735, -0.0057,
   0.1827,  0.0721,  1.0153
);

vec3 whiteBalanceLMS(vec3 linearRgb, vec3 lmsScale) {
  vec3 lms = RGB_TO_LMS * linearRgb;
  lms *= max(lmsScale, vec3(0.0001));
  return LMS_TO_RGB * lms;
}
