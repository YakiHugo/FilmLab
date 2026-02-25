import { DRAW_MODES, type CLEAR_MODES, type Filter, type FilterSystem, type RenderTexture, type Renderer } from "pixi.js";

interface ManualFilterApplyContext {
  filter: Filter;
  filterManager: FilterSystem;
  renderer: Renderer;
  gl: WebGL2RenderingContext;
  nativeProgram: WebGLProgram | null;
}

interface ManualFilterApplyHooks {
  beforeDraw?: (context: ManualFilterApplyContext) => void;
  afterDraw?: (context: ManualFilterApplyContext) => void;
}

const getFilterSystemGlobals = (filterManager: FilterSystem) =>
  (filterManager as any).globalUniforms;

const getFilterSystemQuad = (filterManager: FilterSystem) =>
  (filterManager as any).quad;

const resolveNativeProgram = (filter: Filter, renderer: Renderer): WebGLProgram | null => {
  const contextUid = (renderer as any).CONTEXT_UID;
  const glProgram = (filter.program as any).glPrograms?.[contextUid];
  return glProgram?.program ?? null;
};

/**
 * Pixi v7 workaround path for filters that need manual GL bindings (for example sampler3D).
 * Internal Pixi API access is intentionally centralized in this file.
 */
export const applyManualFilter = (
  filter: Filter,
  filterManager: FilterSystem,
  input: RenderTexture,
  output: RenderTexture,
  clearMode: CLEAR_MODES | undefined,
  hooks?: ManualFilterApplyHooks
): void => {
  const renderer = filterManager.renderer;
  const gl = renderer.gl as WebGL2RenderingContext;

  renderer.state.set(filter.state);
  filterManager.bindAndClear(output, clearMode);

  (filter.uniforms as any).uSampler = input;
  (filter.uniforms as any).filterGlobals = getFilterSystemGlobals(filterManager);

  renderer.shader.bind(filter);

  const nativeProgram = resolveNativeProgram(filter, renderer);
  const context: ManualFilterApplyContext = {
    filter,
    filterManager,
    renderer,
    gl,
    nativeProgram,
  };
  hooks?.beforeDraw?.(context);

  const quad = getFilterSystemQuad(filterManager);
  renderer.geometry.bind(quad);
  renderer.geometry.draw(DRAW_MODES.TRIANGLE_STRIP);

  hooks?.afterDraw?.(context);
};

/**
 * Clear a texture unit and reset Pixi's internal binding cache for that unit.
 */
export const clearTextureUnitBinding = (
  renderer: Renderer,
  gl: WebGL2RenderingContext,
  unit: number
): void => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_3D, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const boundTextures = (renderer.texture as any).boundTextures;
  if (boundTextures && boundTextures[unit] !== undefined) {
    boundTextures[unit] = null;
  }
  gl.activeTexture(gl.TEXTURE0);
};
