#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform vec2 u_start;
uniform vec2 u_end;
uniform float u_feather;
uniform bool u_invert;

void main() {
  vec2 start = u_start;
  vec2 end = u_end;
  vec2 axis = end - start;
  float axisLenSq = max(dot(axis, axis), 1e-6);
  float t = dot(vTextureCoord - start, axis) / axisLenSq;
  t = clamp(t, 0.0, 1.0);

  float feather = clamp(u_feather, 0.0, 1.0);
  float edge0 = clamp(0.5 - 0.5 * feather, 0.0, 1.0);
  float edge1 = clamp(0.5 + 0.5 * feather, 0.0, 1.0);
  float alpha = edge0 >= edge1 ? step(t, 0.5) : 1.0 - smoothstep(edge0, edge1, t);
  if (u_invert) {
    alpha = 1.0 - alpha;
  }

  outColor = vec4(vec3(1.0), clamp(alpha, 0.0, 1.0));
}
