// Geometry pass: crop, translate, rotate, scale, flip, perspective homography,
// lens K1/K2 + chromatic aberration + lens vignette boost. Output is linear.
// Mirrors `shaders/Geometry.frag`. Concatenated with fullscreen + color space
// libs by `passes/develop/geometry.ts`.
//
// Layout note: WGSL std140-ish alignment forbids vec3 between f32s without
// padding. Homography stored as three vec4 columns (xyz used) and rebuilt as
// mat3x3 in the shader; that keeps the JS-side upload as a flat Float32Array.

struct GeometryParams {
  // (cropX, cropY, cropW, cropH) in source UV space.
  cropRect: vec4<f32>,
  // sourceSize.xy + outputSize.xy.
  sourceSize_outputSize: vec4<f32>,
  // translatePx.xy + flip.xy (each ±1).
  translatePx_flip: vec4<f32>,
  // (rotate radians, scale, lensK1, lensK2)
  scalars0: vec4<f32>,
  // (lensVignetteBoost, lensVignetteMidpoint, _, _)
  scalars1: vec4<f32>,
  // (caR, caG, caB) in pixels; w padding.
  caAmountPxRgb: vec4<f32>,
  // (enabled, perspectiveEnabled, lensEnabled, caEnabled) booleans as u32.
  flags: vec4<u32>,
  // Homography columns, xyz used.
  homCol0: vec4<f32>,
  homCol1: vec4<f32>,
  homCol2: vec4<f32>,
};

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> params: GeometryParams;

fn apply_lens_remap(uv: vec2<f32>, k1: f32, k2: f32) -> vec2<f32> {
  let p = uv * 2.0 - vec2<f32>(1.0);
  let r2 = dot(p, p);
  let r4 = r2 * r2;
  let remapped = p * (1.0 + k1 * r2 + k2 * r4);
  return remapped * 0.5 + vec2<f32>(0.5);
}

fn apply_homography(uv: vec2<f32>, h: mat3x3<f32>) -> vec2<f32> {
  let p = uv * 2.0 - vec2<f32>(1.0);
  let hp = h * vec3<f32>(p.x, p.y, 1.0);
  let w = hp.z;
  if (abs(w) < 1.0e-5) {
    return vec2<f32>(-1.0);
  }
  let mapped = hp.xy / w;
  return mapped * 0.5 + vec2<f32>(0.5);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let enabled = params.flags.x != 0u;
  if (!enabled) {
    let passthrough = textureSampleLevel(src, smp, in.uv, 0.0);
    return vec4<f32>(srgb_to_linear(clamp(passthrough.rgb, vec3<f32>(0.0), vec3<f32>(1.0))), passthrough.a);
  }

  let outSize = max(params.sourceSize_outputSize.zw, vec2<f32>(1.0));
  let translatePx = params.translatePx_flip.xy;
  let flip = params.translatePx_flip.zw;
  let rotate = params.scalars0.x;
  let scale = params.scalars0.y;
  let lensK1 = params.scalars0.z;
  let lensK2 = params.scalars0.w;
  let lensVignetteBoost = params.scalars1.x;
  let lensVignetteMidpoint = params.scalars1.y;
  let perspectiveEnabled = params.flags.y != 0u;
  let lensEnabled = params.flags.z != 0u;
  let caEnabled = params.flags.w != 0u;

  let center = outSize * 0.5 + translatePx;
  let pixel = in.uv * outSize;
  let centered = pixel - center;

  // Inverse transform: undo rotate then scale/flip.
  let c = cos(-rotate);
  let s = sin(-rotate);
  let unrotated = vec2<f32>(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c,
  );

  let sxFlip = scale * flip.x;
  let syFlip = scale * flip.y;
  let denom = vec2<f32>(
    max(abs(sxFlip), 1e-5) * sign(sxFlip),
    max(abs(syFlip), 1e-5) * sign(syFlip),
  );
  let local = unrotated / denom + outSize * 0.5;
  let localUv = local / outSize;

  var perspectiveUv = localUv;
  if (perspectiveEnabled) {
    let h = mat3x3<f32>(params.homCol0.xyz, params.homCol1.xyz, params.homCol2.xyz);
    perspectiveUv = apply_homography(localUv, h);
  }

  var opticsUv = perspectiveUv;
  if (lensEnabled) {
    opticsUv = apply_lens_remap(perspectiveUv, lensK1, lensK2);
  }

  if (opticsUv.x < 0.0 || opticsUv.x > 1.0 || opticsUv.y < 0.0 || opticsUv.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let cropOrigin = params.cropRect.xy;
  let cropSize = params.cropRect.zw;
  let sourceUv = cropOrigin + opticsUv * cropSize;
  let caAmountMax = max(abs(params.caAmountPxRgb.r), max(abs(params.caAmountPxRgb.g), abs(params.caAmountPxRgb.b)));
  var sampled: vec4<f32>;
  if (!caEnabled || caAmountMax <= 0.001) {
    sampled = textureSampleLevel(src, smp, sourceUv, 0.0);
  } else {
    let sourceSize = max(params.sourceSize_outputSize.xy, vec2<f32>(1.0));
    let cropMin = cropOrigin;
    let cropMax = cropOrigin + cropSize;
    let uvPerPixel = vec2<f32>(1.0) / sourceSize;
    let radial = opticsUv - vec2<f32>(0.5);
    let radialLen = length(radial);
    var radialDir: vec2<f32>;
    if (radialLen > 1e-5) {
      radialDir = radial / radialLen;
    } else {
      radialDir = vec2<f32>(1.0, 0.0);
    }
    let caOffsetUnit = radialDir * uvPerPixel;
    let sourceUvR = clamp(sourceUv + caOffsetUnit * params.caAmountPxRgb.r, cropMin, cropMax);
    let sourceUvG = clamp(sourceUv + caOffsetUnit * params.caAmountPxRgb.g, cropMin, cropMax);
    let sourceUvB = clamp(sourceUv + caOffsetUnit * params.caAmountPxRgb.b, cropMin, cropMax);
    let c0 = textureSampleLevel(src, smp, sourceUv, 0.0);
    let cR = textureSampleLevel(src, smp, sourceUvR, 0.0);
    let cG = textureSampleLevel(src, smp, sourceUvG, 0.0);
    let cB = textureSampleLevel(src, smp, sourceUvB, 0.0);
    sampled = vec4<f32>(cR.r, cG.g, cB.b, c0.a);
  }

  if (lensVignetteBoost > 0.001) {
    var edge = clamp(length(opticsUv - vec2<f32>(0.5)) * 1.41421356, 0.0, 1.0);
    edge = smoothstep(clamp(lensVignetteMidpoint, 0.0, 0.95), 1.0, edge);
    let lift = 1.0 + edge * edge * lensVignetteBoost * 0.65;
    sampled = vec4<f32>(sampled.rgb * lift, sampled.a);
  }

  return vec4<f32>(srgb_to_linear(clamp(sampled.rgb, vec3<f32>(0.0), vec3<f32>(1.0))), sampled.a);
}
