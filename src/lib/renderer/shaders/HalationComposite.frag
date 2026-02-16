#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;       // Original image (Film pass output)
uniform sampler2D u_blurredMask;  // Blurred threshold mask (R=halation, G=bloom)

// Halation parameters
uniform bool  u_halationEnabled;
uniform float u_halationIntensity;  // [0, 1]
uniform vec3  u_halationColor;      // Tint color (default warm red: 1.0, 0.3, 0.1)

// Bloom parameters
uniform bool  u_bloomEnabled;
uniform float u_bloomIntensity;     // [0, 1]

void main() {
  vec3 original = texture(uSampler, vTextureCoord).rgb;
  vec2 mask = texture(u_blurredMask, vTextureCoord).rg;

  vec3 color = original;

  // Halation: tinted additive blend from blurred bright areas
  if (u_halationEnabled && u_halationIntensity > 0.001) {
    float halation = mask.r * u_halationIntensity;
    color += u_halationColor * halation;
  }

  // Bloom: neutral additive blend from blurred bright areas
  if (u_bloomEnabled && u_bloomIntensity > 0.001) {
    float bloom = mask.g * u_bloomIntensity;
    color += vec3(bloom);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
