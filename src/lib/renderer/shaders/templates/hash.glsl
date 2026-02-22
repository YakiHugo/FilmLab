float hash12(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33 + seed * 0.000001);
  return fract((p3.x + p3.y) * p3.z);
}
