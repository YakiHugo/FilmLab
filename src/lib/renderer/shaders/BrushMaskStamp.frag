#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_canvasSize;
uniform vec2 u_centerPx;
uniform float u_radiusPx;
uniform float u_innerRadiusPx;
uniform float u_flow;

void main() {
  float previousAlpha = texture(uSampler, vTextureCoord).a;
  vec2 pixel = vTextureCoord * u_canvasSize;
  float distancePx = length(pixel - u_centerPx);

  float dabAlpha = 0.0;
  if (distancePx <= u_radiusPx) {
    if (u_radiusPx <= u_innerRadiusPx + 1e-4) {
      dabAlpha = u_flow;
    } else {
      dabAlpha = u_flow * (1.0 - smoothstep(u_innerRadiusPx, u_radiusPx, distancePx));
    }
  }

  float alpha = dabAlpha + previousAlpha * (1.0 - dabAlpha);
  outColor = vec4(vec3(1.0), clamp(alpha, 0.0, 1.0));
}
