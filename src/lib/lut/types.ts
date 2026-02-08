export interface ParsedCubeLut {
  title?: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array;
}

