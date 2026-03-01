#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_glowMask;
uniform bool u_glowEnabled;
uniform float u_glowIntensity;
uniform float u_glowBias;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_glowEnabled && u_glowIntensity > 0.001) {
    vec3 blurredGlow = texture(u_glowMask, vTextureCoord).rgb;
    float bias = clamp(u_glowBias, 0.0, 1.0);
    float gain = clamp(u_glowIntensity, 0.0, 1.0) * mix(0.65, 1.35, bias);
    color += blurredGlow * gain;
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
