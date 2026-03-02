#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_filmBreathEnabled;
uniform float u_breathAmount;
uniform float u_breathSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_filmBreathEnabled && u_breathAmount > 0.001) {
    float amount = clamp(u_breathAmount, 0.0, 1.0);
    float seed = u_breathSeed * 0.0001;
    float n0 = hash12(vec2(seed, seed * 1.7));
    float n1 = hash12(vec2(seed * 3.1, seed * 0.91));
    float n2 = hash12(vec2(seed * 1.3, seed * 2.4));

    vec2 seedOffset = vec2(fract(seed * 0.73), fract(seed * 0.37));
    vec2 spatialUv = vTextureCoord * 0.5 + seedOffset;
    float spatialNoise = hash12(floor(spatialUv * 4.0)) * 0.5 + 0.5;

    float exposure = (n0 - 0.5) * 0.16 * amount;
    float contrast = (n1 - 0.5) * 0.22 * amount;
    float localExposure = exposure * (0.7 + spatialNoise * 0.6);
    float localContrast = contrast * (0.8 + spatialNoise * 0.4);
    vec3 tint = vec3((n2 - 0.5) * 0.035, 0.0, (0.5 - n2) * 0.03) * amount;

    color *= exp2(localExposure);
    const float pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + localContrast));
    color += tint * (0.8 + spatialNoise * 0.4);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
