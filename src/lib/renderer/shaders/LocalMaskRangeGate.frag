#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_mask;
uniform bool u_useLumaRange;
uniform float u_lumaMin;
uniform float u_lumaMax;
uniform float u_lumaFeather;
uniform bool u_useColorRange;
uniform float u_hueCenter;
uniform float u_hueRange;
uniform float u_hueFeather;
uniform float u_satMin;
uniform float u_satFeather;

float resolveHueDistance(float a, float b) {
  float delta = mod(abs(a - b), 360.0);
  return delta > 180.0 ? 360.0 - delta : delta;
}

vec2 resolveHueSat(vec3 color) {
  float maxChannel = max(max(color.r, color.g), color.b);
  float minChannel = min(min(color.r, color.g), color.b);
  float diff = maxChannel - minChannel;
  float sat = maxChannel <= 1e-6 ? 0.0 : diff / maxChannel;
  if (diff <= 1e-6) {
    return vec2(0.0, sat);
  }

  float hue;
  if (maxChannel == color.r) {
    hue = mod((color.g - color.b) / diff, 6.0);
  } else if (maxChannel == color.g) {
    hue = (color.b - color.r) / diff + 2.0;
  } else {
    hue = (color.r - color.g) / diff + 4.0;
  }

  hue *= 60.0;
  if (hue < 0.0) {
    hue += 360.0;
  }
  return vec2(hue, sat);
}

float resolveLumaWeight(float luma) {
  if (!u_useLumaRange) {
    return 1.0;
  }
  if (luma < u_lumaMin) {
    if (u_lumaFeather <= 1e-4) {
      return 0.0;
    }
    return smoothstep(u_lumaMin - u_lumaFeather, u_lumaMin, luma);
  }
  if (luma > u_lumaMax) {
    if (u_lumaFeather <= 1e-4) {
      return 0.0;
    }
    return 1.0 - smoothstep(u_lumaMax, u_lumaMax + u_lumaFeather, luma);
  }
  return 1.0;
}

float resolveColorWeight(float hue, float sat) {
  if (!u_useColorRange) {
    return 1.0;
  }

  float hueWeight = 1.0;
  if (u_hueRange < 179.999) {
    if (sat <= 1e-3) {
      return 0.0;
    }
    float distance = resolveHueDistance(hue, u_hueCenter);
    if (distance <= u_hueRange) {
      hueWeight = 1.0;
    } else if (u_hueFeather <= 1e-4) {
      hueWeight = 0.0;
    } else {
      hueWeight =
        1.0 - smoothstep(u_hueRange, min(180.0, u_hueRange + u_hueFeather), distance);
    }
  }

  float satWeight = 1.0;
  if (u_satMin > 1e-4) {
    if (u_satFeather <= 1e-4) {
      satWeight = sat >= u_satMin ? 1.0 : 0.0;
    } else {
      satWeight = smoothstep(u_satMin, min(1.0, u_satMin + u_satFeather), sat);
    }
  }

  return hueWeight * satWeight;
}

void main() {
  float maskAlpha = clamp(texture(u_mask, vTextureCoord).a, 0.0, 1.0);
  if (maskAlpha <= 1e-6) {
    outColor = vec4(1.0, 1.0, 1.0, 0.0);
    return;
  }

  vec3 source = clamp(texture(uSampler, vTextureCoord).rgb, 0.0, 1.0);
  float weight = 1.0;
  weight *= resolveLumaWeight(dot(source, vec3(0.2126, 0.7152, 0.0722)));
  if (weight > 1e-4 && u_useColorRange) {
    vec2 hueSat = resolveHueSat(source);
    weight *= resolveColorWeight(hueSat.x, hueSat.y);
  }

  outColor = vec4(1.0, 1.0, 1.0, clamp(maskAlpha * weight, 0.0, 1.0));
}
