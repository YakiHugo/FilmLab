/**
 * Compile-Time Shader Code Generator
 *
 * Reads shader configuration and GLSL template fragments, then generates
 * optimized Master and Film shader source files. Only enabled features
 * contribute uniforms and code to the output.
 *
 * Usage: tsx scripts/generate-shaders.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Resolve project paths (ESM-compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SHADERS_DIR = path.join(ROOT, "src/lib/renderer/shaders");
const TEMPLATES_DIR = path.join(SHADERS_DIR, "templates");
const GENERATED_DIR = path.join(SHADERS_DIR, "generated");

// Import config — use file:// URL for Windows compatibility
const configPath = path.join(ROOT, "src/lib/renderer/shader.config.ts");
const { masterConfig, filmConfig } = await import(
  pathToFileURL(configPath).href
);

// ---------------------------------------------------------------------------
// Uniform registries — maps feature name to GLSL uniform declarations
// ---------------------------------------------------------------------------

const MASTER_UNIFORMS: Record<string, string[]> = {
  exposure: ["uniform float u_exposure;"],
  contrast: ["uniform float u_contrast;"],
  tonalRange: [
    "uniform vec4  u_tonalRange;  // (highlights, shadows, whites, blacks)",
  ],
  curve: [
    "uniform vec4  u_curve;       // (curveHi, curveLights, curveDarks, curveShadows)",
  ],
  whiteBalance: ["uniform float u_temperature;", "uniform float u_tint;"],
  hsl: [
    "uniform float u_hueShift;",
    "uniform float u_saturation;",
    "uniform float u_vibrance;",
    "uniform float u_luminance;",
  ],
  dehaze: ["uniform float u_dehaze;"],
};

const FILM_UNIFORMS: Record<string, string[]> = {
  toneResponse: [
    "uniform bool  u_toneEnabled;",
    "uniform float u_shoulder;       // [0, 1]",
    "uniform float u_toe;            // [0, 1]",
    "uniform float u_gamma;          // [0.5, 2.0]",
  ],
  lut: [
    "uniform bool  u_lutEnabled;",
    "uniform float u_lutIntensity;   // [0, 1]",
  ],
  colorMatrix: [
    "uniform bool u_colorMatrixEnabled;",
    "uniform mat3 u_colorMatrix;",
  ],
  colorCast: [
    "uniform bool  u_colorCastEnabled;",
    "uniform vec3  u_colorCastShadows;    // RGB offset for shadows",
    "uniform vec3  u_colorCastMidtones;   // RGB offset for midtones",
    "uniform vec3  u_colorCastHighlights; // RGB offset for highlights",
  ],
  grain: [
    "uniform bool  u_grainEnabled;",
    "uniform float u_grainAmount;",
    "uniform float u_grainSize;",
    "uniform float u_grainRoughness;",
    "uniform float u_grainShadowBias;",
    "uniform float u_grainSeed;",
    "uniform bool  u_grainIsColor;",
  ],
  vignette: [
    "uniform bool  u_vignetteEnabled;",
    "uniform float u_vignetteAmount;",
    "uniform float u_vignetteMidpoint;",
    "uniform float u_vignetteRoundness;",
  ],
};

// ---------------------------------------------------------------------------
// Template loader
// ---------------------------------------------------------------------------

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf-8").trimEnd();
}

// ---------------------------------------------------------------------------
// Dead code elimination — remove function definitions never called
// ---------------------------------------------------------------------------

function eliminateUnusedFunctions(source: string): string {
  // Match top-level function definitions (not main)
  const funcDefPattern =
    /^(?:vec[234]|float|mat[234]|void|int|bool)\s+(\w+)\s*\([^)]*\)\s*\{/gm;
  const functions: string[] = [];
  let match;
  while ((match = funcDefPattern.exec(source)) !== null) {
    if (match[1] !== "main") {
      functions.push(match[1]);
    }
  }

  let result = source;
  for (const name of functions) {
    // Count references: definition line + call sites
    const refPattern = new RegExp(`\\b${name}\\b`, "g");
    const refs = result.match(refPattern);
    if (!refs || refs.length <= 1) {
      // Only the definition exists — remove the entire function block
      result = removeFunctionBlock(result, name);
    }
  }

  return result;
}

function removeFunctionBlock(source: string, funcName: string): string {
  // Find the function definition line
  const defPattern = new RegExp(
    `^(?:vec[234]|float|mat[234]|void|int|bool)\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`,
    "m"
  );
  const defMatch = defPattern.exec(source);
  if (!defMatch) return source;

  // Find start — include preceding comment lines
  let start = defMatch.index;
  const lines = source.substring(0, start).split("\n");
  while (
    lines.length > 0 &&
    (lines[lines.length - 1].trim().startsWith("//") ||
      lines[lines.length - 1].trim() === "")
  ) {
    start -= lines.pop()!.length + 1; // +1 for newline
  }
  start = Math.max(0, start);

  // Find end — count braces to find matching close
  let braceCount = 0;
  let end = defMatch.index;
  for (let i = defMatch.index; i < source.length; i++) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  // Remove the block (and trailing newlines)
  while (end < source.length && source[end] === "\n") end++;

  return source.substring(0, start) + source.substring(end);
}

// ---------------------------------------------------------------------------
// Master Shader Generator
// ---------------------------------------------------------------------------

function generateMasterShader(): string {
  const cfg = masterConfig;
  const parts: string[] = [];

  // Header
  parts.push("#version 300 es");
  parts.push("precision highp float;");
  parts.push("");
  parts.push("in vec2 vTextureCoord;");
  parts.push("out vec4 outColor;");
  parts.push("");
  parts.push("uniform sampler2D uSampler;");

  // Uniforms — grouped to match the original shader's layout
  parts.push("");
  parts.push("// -- Basic --");
  if (cfg.exposure.enabled) {
    parts.push(...MASTER_UNIFORMS.exposure);
  }
  if (cfg.contrast.enabled) {
    parts.push(...MASTER_UNIFORMS.contrast);
  }
  if (cfg.tonalRange.enabled) {
    parts.push(...MASTER_UNIFORMS.tonalRange);
  }
  if (cfg.curve.enabled) {
    parts.push(...MASTER_UNIFORMS.curve);
  }

  if (cfg.whiteBalance.enabled) {
    parts.push("");
    parts.push("// -- White Balance --");
    parts.push(...MASTER_UNIFORMS.whiteBalance);
  }

  if (cfg.hsl.enabled) {
    parts.push("");
    parts.push("// -- OKLab HSL --");
    parts.push(...MASTER_UNIFORMS.hsl);
  }

  if (cfg.dehaze.enabled) {
    parts.push("");
    parts.push("// -- Detail --");
    parts.push(...MASTER_UNIFORMS.dehaze);
  }

  // Function definitions — in dependency order
  parts.push("");
  parts.push(loadTemplate("srgb.glsl"));

  if (cfg.hsl.enabled && cfg.hsl.space === "OKLab") {
    parts.push("");
    parts.push(loadTemplate("oklab.glsl"));
  }

  if (cfg.whiteBalance.enabled && cfg.whiteBalance.algorithm === "LMS") {
    parts.push("");
    parts.push(loadTemplate("lms.glsl"));
  }

  const needsLuminance = cfg.tonalRange.enabled || cfg.curve.enabled;
  if (needsLuminance) {
    parts.push("");
    parts.push(loadTemplate("luminance.glsl"));
  }

  // main() body — inline code matching the original shader exactly
  parts.push("");
  parts.push("// ---- Main ----");
  parts.push("");
  parts.push("void main() {");
  parts.push("  vec3 color = texture(uSampler, vTextureCoord).rgb;");

  // Step 1: sRGB -> Linear (always)
  parts.push("");
  parts.push("  // Step 1: sRGB -> Linear");
  parts.push("  color = srgb2linear(color);");

  // Step 2: Exposure
  if (cfg.exposure.enabled) {
    parts.push("");
    parts.push("  // Step 2: Exposure (linear space, physically accurate)");
    parts.push("  color *= exp2(u_exposure);");
  }

  // Step 3: White Balance
  if (cfg.whiteBalance.enabled) {
    parts.push("");
    parts.push("  // Step 3: LMS white balance");
    parts.push(
      "  color = whiteBalanceLMS(color, u_temperature / 100.0, u_tint / 100.0);"
    );
  }

  // Step 4: Contrast
  if (cfg.contrast.enabled) {
    parts.push("");
    parts.push(
      "  // Step 4: Contrast (linear space, pivot = 0.18 mid-gray)"
    );
    parts.push("  float pivot = 0.18;");
    parts.push(
      "  color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + u_contrast * 0.01));"
    );
  }

  // Step 5: Tonal range
  let lumDeclared = false;
  if (cfg.tonalRange.enabled) {
    parts.push("");
    parts.push("  // Step 5: Tonal range adjustments");
    parts.push("  float lum = luminance(color);");
    lumDeclared = true;
    parts.push("  float hiMask = smoothstep(0.5, 1.0, lum);");
    parts.push("  float shMask = 1.0 - smoothstep(0.0, 0.5, lum);");
    parts.push("  float whMask = smoothstep(0.75, 1.0, lum);");
    parts.push("  float blMask = 1.0 - smoothstep(0.0, 0.25, lum);");
    parts.push("");
    parts.push("  float tonalDelta = hiMask * u_tonalRange.x * 0.01");
    parts.push(
      "                   + shMask * u_tonalRange.y * 0.01"
    );
    parts.push(
      "                   + whMask * u_tonalRange.z * 0.01"
    );
    parts.push(
      "                   + blMask * u_tonalRange.w * 0.01;"
    );
    parts.push("  color += color * tonalDelta;");
  }

  // Step 6: Curves
  if (cfg.curve.enabled) {
    parts.push("");
    parts.push("  // Step 6: Curves (4 segment additive)");
    if (lumDeclared) {
      parts.push("  lum = luminance(color);");
    } else {
      parts.push("  float lum = luminance(color);");
      lumDeclared = true;
    }
    parts.push(
      "  float curveDelta = smoothstep(0.7, 1.0, lum) * u_curve.x * 0.01"
    );
    parts.push(
      "                   + smoothstep(0.4, 0.7, lum) * (1.0 - smoothstep(0.7, 0.85, lum)) * u_curve.y * 0.01"
    );
    parts.push(
      "                   + smoothstep(0.15, 0.4, lum) * (1.0 - smoothstep(0.4, 0.55, lum)) * u_curve.z * 0.01"
    );
    parts.push(
      "                   + (1.0 - smoothstep(0.1, 0.3, lum)) * u_curve.w * 0.01;"
    );
    parts.push("  color += color * curveDelta;");
  }

  // Step 7: OKLab HSL
  if (cfg.hsl.enabled) {
    parts.push("");
    parts.push("  // Step 7: OKLab HSL adjustments");
    parts.push("  vec3 lab = rgb2oklab(color);");
    parts.push("  // Hue rotation");
    parts.push("  float angle = u_hueShift * 3.14159265 / 180.0;");
    parts.push("  float ca = cos(angle), sa = sin(angle);");
    parts.push(
      "  lab.yz = vec2(lab.y * ca - lab.z * sa, lab.y * sa + lab.z * ca);"
    );
    parts.push("  // Saturation");
    parts.push("  lab.yz *= (1.0 + u_saturation * 0.01);");
    parts.push("  // Vibrance (low-saturation pixels boosted more)");
    parts.push("  float chroma = length(lab.yz);");
    parts.push(
      "  float vibranceBoost = u_vibrance * 0.01 * (1.0 - smoothstep(0.0, 0.15, chroma));"
    );
    parts.push("  lab.yz *= (1.0 + vibranceBoost);");
    parts.push("  // Luminance");
    parts.push("  lab.x *= (1.0 + u_luminance * 0.01);");
    parts.push("  color = oklab2rgb(lab);");
  }

  // Step 8: Dehaze
  if (cfg.dehaze.enabled) {
    parts.push("");
    parts.push("  // Step 8: Dehaze");
    parts.push("  if (abs(u_dehaze) > 0.001) {");
    parts.push("    float haze = u_dehaze * 0.01;");
    parts.push(
      "    color = (color - haze * 0.1) / max(1.0 - haze * 0.3, 0.1);"
    );
    parts.push("  }");
  }

  // Step 9: Linear -> sRGB (always)
  parts.push("");
  parts.push("  // Step 9: Linear -> sRGB");
  parts.push("  color = linear2srgb(clamp(color, 0.0, 1.0));");
  parts.push("");
  parts.push("  outColor = vec4(color, 1.0);");
  parts.push("}");

  let source = parts.join("\n") + "\n";
  source = eliminateUnusedFunctions(source);
  return source;
}

// ---------------------------------------------------------------------------
// Film Shader Generator
// ---------------------------------------------------------------------------

function generateFilmShader(): string {
  const cfg = filmConfig;
  const parts: string[] = [];

  // Header
  parts.push("#version 300 es");
  parts.push("precision highp float;");
  if (cfg.lut.enabled) {
    parts.push("precision highp sampler3D;");
  }
  parts.push("");
  parts.push("in vec2 vTextureCoord;");
  parts.push("out vec4 outColor;");
  parts.push("");
  parts.push("uniform sampler2D uSampler;     // Master Pass output");
  if (cfg.lut.enabled) {
    parts.push("uniform sampler3D u_lut;        // 3D LUT texture");
  }

  // Uniforms — grouped by layer
  if (cfg.toneResponse.enabled) {
    parts.push("");
    parts.push("// Layer 1: Tone Response");
    parts.push(...FILM_UNIFORMS.toneResponse);
  }

  if (cfg.lut.enabled) {
    parts.push("");
    parts.push("// Layer 3: LUT");
    parts.push(...FILM_UNIFORMS.lut);
  }

  if (cfg.colorMatrix.enabled) {
    parts.push("");
    parts.push("// Layer 2: Color Matrix");
    parts.push(...FILM_UNIFORMS.colorMatrix);
  }

  if (cfg.colorCast.enabled) {
    parts.push("");
    parts.push("// Layer 4: Color Cast (per-zone tinting)");
    parts.push(...FILM_UNIFORMS.colorCast);
  }

  if (cfg.grain.enabled) {
    parts.push("");
    parts.push("// Layer 6: Grain");
    parts.push(...FILM_UNIFORMS.grain);
  }

  if (cfg.vignette.enabled) {
    parts.push("");
    parts.push("// Layer 6: Vignette");
    parts.push(...FILM_UNIFORMS.vignette);
  }

  // Function definitions — ordered to match original shader layout:
  // luminance → hash12 → toneResponse → lut3d → colorCast → grain → vignette
  const needsLuminance = cfg.colorCast.enabled || cfg.grain.enabled;
  if (needsLuminance) {
    parts.push("");
    parts.push(loadTemplate("luminance.glsl"));
  }

  if (cfg.grain.enabled) {
    parts.push("");
    parts.push(loadTemplate("hash.glsl"));
  }

  if (cfg.toneResponse.enabled) {
    parts.push("");
    parts.push(loadTemplate("toneResponse.glsl"));
  }

  if (cfg.lut.enabled) {
    parts.push("");
    parts.push(loadTemplate("lut3d.glsl"));
  }

  if (cfg.colorMatrix.enabled) {
    parts.push("");
    parts.push(loadTemplate("colorMatrix.glsl"));
  }

  if (cfg.colorCast.enabled) {
    parts.push("");
    parts.push(loadTemplate("colorCast.glsl"));
  }

  if (cfg.grain.enabled) {
    parts.push("");
    parts.push(loadTemplate("grain.glsl"));
  }

  if (cfg.vignette.enabled) {
    parts.push("");
    parts.push(loadTemplate("vignette.glsl"));
  }

  // main() body
  parts.push("");
  parts.push("// ---- Main ----");
  parts.push("");
  parts.push("void main() {");
  parts.push("  vec3 color = texture(uSampler, vTextureCoord).rgb;");

  if (cfg.toneResponse.enabled) {
    parts.push("");
    parts.push("  color = applyToneResponse(color);");
  }
  if (cfg.colorMatrix.enabled) {
    parts.push("  color = applyColorMatrix(color);");
  }
  if (cfg.lut.enabled) {
    parts.push("  color = applyLUT(color);");
  }
  if (cfg.colorCast.enabled) {
    parts.push("  color = applyColorCast(color);");
  }
  if (cfg.grain.enabled) {
    parts.push("  color = applyGrain(color);");
  }
  if (cfg.vignette.enabled) {
    parts.push("  color = applyVignette(color);");
  }

  parts.push("");
  parts.push("  outColor = vec4(color, 1.0);");
  parts.push("}");

  let source = parts.join("\n") + "\n";
  source = eliminateUnusedFunctions(source);
  return source;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

// Ensure output directory exists
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// Generate Master shader
const masterSource = generateMasterShader();
fs.writeFileSync(
  path.join(GENERATED_DIR, "MasterAdjustment.frag"),
  masterSource
);

// Generate Film shader
const filmSource = generateFilmShader();
fs.writeFileSync(
  path.join(GENERATED_DIR, "FilmSimulation.frag"),
  filmSource
);

// Copy vertex shader
fs.copyFileSync(
  path.join(SHADERS_DIR, "default.vert"),
  path.join(GENERATED_DIR, "default.vert")
);

// Summary
const masterLines = masterSource.split("\n").length;
const filmLines = filmSource.split("\n").length;
console.log("Shaders generated successfully:");
console.log(`  MasterAdjustment.frag  ${masterLines} lines`);
console.log(`  FilmSimulation.frag    ${filmLines} lines`);
console.log(`  default.vert           (copied)`);
console.log(`  Output: ${GENERATED_DIR}`);
