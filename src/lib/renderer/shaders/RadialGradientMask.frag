#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform vec2 u_center;
uniform vec2 u_radius;
uniform float u_feather;
uniform bool u_invert;

void main() {
  vec2 center = u_center;
  vec2 radius = max(vec2(0.0001), u_radius);
  vec2 delta = (vTextureCoord - center) / radius;
  float dist = length(delta);

  float feather = clamp(u_feather, 0.0, 1.0);
  float inner = max(0.0, 1.0 - feather);
  float alpha = inner >= 1.0 ? step(dist, 1.0) : 1.0 - smoothstep(inner, 1.0, dist);
  if (u_invert) {
    alpha = 1.0 - alpha;
  }

  outColor = vec4(vec3(1.0), clamp(alpha, 0.0, 1.0));
}
