#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler; // base (linear)
uniform sampler2D u_layer;  // local layer (linear)
uniform sampler2D u_mask;   // alpha mask

void main() {
  vec4 base = texture(uSampler, vTextureCoord);
  vec4 layer = texture(u_layer, vTextureCoord);
  float maskAlpha = clamp(texture(u_mask, vTextureCoord).a, 0.0, 1.0);
  vec3 blended = mix(base.rgb, layer.rgb, maskAlpha);
  float alpha = mix(base.a, layer.a, maskAlpha);
  outColor = vec4(max(blended, vec3(0.0)), alpha);
}
