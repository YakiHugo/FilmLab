#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;       // Original image (Film pass output)
uniform sampler2D u_blurredMask;  // Blurred optics energy (RGB=halation, A=bloom)

// Halation parameters
uniform bool  u_halationEnabled;
uniform float u_halationIntensity;  // [0, 1]
uniform vec3  u_halationColor;      // Tint color (default warm red: 1.0, 0.3, 0.1)
uniform float u_halationHue;        // degrees [0, 360)
uniform float u_halationSaturation; // [0, 1]
uniform float u_halationBlueCompensation; // [0, 1]

// Bloom parameters
uniform bool  u_bloomEnabled;
uniform float u_bloomIntensity;     // [0, 1]

vec3 hueToRgb(float hueDegrees) {
  float h = fract(hueDegrees / 360.0);
  float r = clamp(abs(h * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  float g = clamp(2.0 - abs(h * 6.0 - 2.0), 0.0, 1.0);
  float b = clamp(2.0 - abs(h * 6.0 - 4.0), 0.0, 1.0);
  return vec3(r, g, b);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 original = sampled.rgb;
  vec4 energy = texture(u_blurredMask, vTextureCoord);

  vec3 color = original;

  // Halation: tint blurred halation energy.
  if (u_halationEnabled && u_halationIntensity > 0.001) {
    vec3 hueTint = hueToRgb(u_halationHue);
    vec3 saturationTint = mix(vec3(1.0), hueTint, clamp(u_halationSaturation, 0.0, 1.0));
    vec3 halationTint = mix(u_halationColor, saturationTint, 0.7);
    halationTint.b += u_halationBlueCompensation * 0.35;
    color += energy.rgb * halationTint * u_halationIntensity;
  }

  // Bloom: neutral additive from blurred bloom energy.
  if (u_bloomEnabled && u_bloomIntensity > 0.001) {
    color += vec3(energy.a * u_bloomIntensity);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
