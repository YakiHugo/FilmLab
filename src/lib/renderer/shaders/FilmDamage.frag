#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_damageTexture;
uniform bool u_filmDamageEnabled;
uniform float u_damageAmount;
uniform float u_damageSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_filmDamageEnabled && u_damageAmount > 0.001) {
    float amount = clamp(u_damageAmount, 0.0, 1.0);
    vec2 seedOffset = vec2(
      fract(u_damageSeed * 0.00013),
      fract(u_damageSeed * 0.00027)
    );

    vec2 damageUv = fract(vTextureCoord * vec2(1.2, 1.35) + seedOffset);
    vec3 damageTex = texture(u_damageTexture, damageUv).rgb;

    float dust = smoothstep(0.92, 1.0, damageTex.r + hash12(damageUv * 127.0) * 0.12);
    float scratches = smoothstep(0.8, 1.0, abs(fract((damageUv.x + seedOffset.x) * 90.0) - 0.5) * 2.0);
    scratches *= smoothstep(0.6, 1.0, damageTex.g + hash12(damageUv.yx * 191.0) * 0.2);

    color = mix(color, color * 0.6, dust * amount * 0.55);
    color += vec3(scratches * amount * 0.11);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
