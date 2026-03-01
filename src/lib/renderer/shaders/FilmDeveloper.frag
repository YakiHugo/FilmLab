#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_filmDeveloperEnabled;
uniform float u_developerContrast;
uniform float u_developerGamma;
uniform vec3 u_colorSeparation;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_filmDeveloperEnabled) {
    vec3 separation = max(u_colorSeparation, vec3(0.0));
    color *= separation;

    float gammaValue = max(0.25, u_developerGamma);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / gammaValue));

    float contrast = clamp(u_developerContrast, -1.0, 1.0);
    const float pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + contrast));
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
