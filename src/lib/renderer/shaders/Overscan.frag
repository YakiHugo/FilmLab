#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_borderTexture;
uniform bool u_overscanEnabled;
uniform float u_overscanAmount;
uniform float u_overscanRoundness;

float roundedRectMask(vec2 uv, float roundness) {
  vec2 centered = abs(uv - 0.5) * 2.0;
  float corner = mix(0.02, 0.28, clamp(roundness, 0.0, 1.0));
  vec2 q = centered - vec2(1.0 - corner);
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  return 1.0 - smoothstep(-0.005, 0.03, outside);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_overscanEnabled && u_overscanAmount > 0.001) {
    float amount = clamp(u_overscanAmount, 0.0, 1.0);
    float frameMask = roundedRectMask(vTextureCoord, u_overscanRoundness);
    float edge = 1.0 - frameMask;

    float sprocketBandLeft = 1.0 - smoothstep(0.02, 0.035, vTextureCoord.x);
    float sprocketBandRight = smoothstep(0.965, 0.98, vTextureCoord.x);
    float holeLeft = 1.0 - smoothstep(0.08, 0.12, abs(fract(vTextureCoord.y * 8.0) - 0.5));
    float holeRight =
      1.0 - smoothstep(0.08, 0.12, abs(fract(vTextureCoord.y * 8.0 + 0.5) - 0.5));
    float sprocketLeft = sprocketBandLeft * holeLeft;
    float sprocketRight = sprocketBandRight * holeRight;
    float sprocketMask = clamp(sprocketLeft + sprocketRight, 0.0, 1.0);

    vec3 borderTex = texture(u_borderTexture, fract(vTextureCoord * vec2(1.0, 1.5))).rgb;
    vec3 borderColor = mix(vec3(0.015), borderTex * 0.12, 0.45);

    color = mix(color, borderColor, edge * amount * 0.92);
    color = mix(color, vec3(0.0), sprocketMask * amount * 0.8);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
