#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_inputLinear;
uniform bool u_enableDither;
uniform bool u_applyToneMap;
uniform vec2 u_outputSize;

vec3 linear2srgb(vec3 c) {
  return mix(
    c * 12.92,
    1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 toneMap(vec3 c) {
  return c / (vec3(1.0) + c);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;
  float alpha = clamp(sampled.a, 0.0, 1.0);

  if (u_inputLinear) {
    color = max(color, vec3(0.0));
    if (u_applyToneMap) {
      color = toneMap(color);
    }
    color = linear2srgb(clamp(color, 0.0, 1.0));
  }

  if (u_enableDither) {
    vec2 pixel = vTextureCoord * max(u_outputSize, vec2(1.0));
    float noise = hash12(floor(pixel)) - 0.5;
    color += noise / 255.0;
  }

  outColor = vec4(clamp(color, 0.0, 1.0), alpha);
}
