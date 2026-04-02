#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform float u_brightness;
uniform float u_hueRadians;

const mat3 RGB_TO_YIQ = mat3(
  0.299, 0.587, 0.114,
  0.596, -0.275, -0.321,
  0.212, -0.523, 0.311
);

const mat3 YIQ_TO_RGB = mat3(
  1.0, 0.956, 0.621,
  1.0, -0.272, -0.647,
  1.0, -1.106, 1.703
);

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = max(sampled.rgb * u_brightness, vec3(0.0));

  if (abs(u_hueRadians) > 0.0001) {
    vec3 yiq = RGB_TO_YIQ * color;
    float chroma = length(yiq.yz);
    float angle = atan(yiq.z, yiq.y) + u_hueRadians;
    yiq.y = chroma * cos(angle);
    yiq.z = chroma * sin(angle);
    color = YIQ_TO_RGB * yiq;
  }

  outColor = vec4(clamp(color, 0.0, 1.0), sampled.a);
}
