#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_vignetteEnabled;
uniform float u_vignetteAmount;
uniform float u_vignetteMidpoint;
uniform float u_vignetteRoundness;
uniform float u_aspectRatio;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_vignetteEnabled && abs(u_vignetteAmount) >= 0.001) {
    vec2 center = vTextureCoord - 0.5;
    center.x *= mix(1.0, u_aspectRatio, u_vignetteRoundness);

    float dist = length(center) * 2.0;
    float edge = smoothstep(u_vignetteMidpoint, 1.0, dist);

    if (u_vignetteAmount > 0.0) {
      float darkening = 1.0 - edge * edge * u_vignetteAmount;
      float contrastReduction = 1.0 - edge * u_vignetteAmount * 0.15;
      color = mix(vec3(0.18), color, contrastReduction) * darkening;
    } else {
      color += vec3(edge * edge * abs(u_vignetteAmount) * 0.35);
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
