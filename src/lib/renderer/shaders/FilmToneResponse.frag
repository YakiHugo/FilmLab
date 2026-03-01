#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_toneEnabled;
uniform float u_shoulder;
uniform float u_toe;
uniform float u_gamma;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float toneChannel(float x, float shoulder, float toe, float gamma) {
  x = pow(max(x, 0.0), gamma);

  float k = shoulder * 2.0;
  float compressed = x * (1.0 + k) / (x + k + 0.0001);
  x = mix(x, compressed, shoulder);

  float toeGamma = 1.0 / (1.0 + toe);
  float lifted = pow(max(x, 0.0), toeGamma);
  x = mix(x, lifted, toe);

  return max(x, 0.0);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_toneEnabled) {
    float lum = luminance(color);
    float mappedLum = toneChannel(lum, u_shoulder, u_toe, u_gamma);
    if (lum <= 1e-5) {
      color = vec3(mappedLum);
    } else {
      float ratio = mappedLum / lum;
      color = max(color * ratio, vec3(0.0));
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
