// ---- sRGB <-> Linear ----

vec3 srgb2linear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

vec3 linear2srgb(vec3 c) {
  return mix(
    c * 12.92,
    1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}
