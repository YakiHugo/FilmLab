#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_gateWeaveEnabled;
uniform float u_gateWeaveAmount;
uniform float u_gateWeaveSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vTextureCoord;

  if (u_gateWeaveEnabled && u_gateWeaveAmount > 0.001) {
    float seed = u_gateWeaveSeed * 0.0001;
    float amount = clamp(u_gateWeaveAmount, 0.0, 1.0);
    float offsetX = (hash12(vec2(seed, seed * 1.3)) - 0.5) * amount * 0.003;
    float offsetY = (hash12(vec2(seed * 2.1, seed)) - 0.5) * amount * 0.002;
    float rotation = (hash12(vec2(seed * 0.7, seed * 1.9)) - 0.5) * amount * 0.001;

    vec2 center = uv - 0.5;
    float c = cos(rotation);
    float s = sin(rotation);
    center = vec2(center.x * c - center.y * s, center.x * s + center.y * c);
    uv = center + 0.5 + vec2(offsetX, offsetY);
  }

  outColor = texture(uSampler, clamp(uv, vec2(0.0), vec2(1.0)));
}
