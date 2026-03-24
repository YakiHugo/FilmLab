import type { CanvasNodeTransform } from "@/types";

export const DEFAULT_TRANSFORM: CanvasNodeTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
};

export const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export const areEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (left instanceof Blob || right instanceof Blob) {
    return left === right;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => areEqual(entry, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(right, key) && areEqual(left[key], right[key])
    );
  }

  return false;
};

export const toNodeTransform = (input?: Partial<CanvasNodeTransform>): CanvasNodeTransform => ({
  x: Number(input?.x ?? DEFAULT_TRANSFORM.x) || 0,
  y: Number(input?.y ?? DEFAULT_TRANSFORM.y) || 0,
  width: Math.max(1, Number(input?.width ?? DEFAULT_TRANSFORM.width) || 1),
  height: Math.max(1, Number(input?.height ?? DEFAULT_TRANSFORM.height) || 1),
  rotation: Number(input?.rotation ?? DEFAULT_TRANSFORM.rotation) || 0,
});
