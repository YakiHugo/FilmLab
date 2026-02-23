import type { EditingAdjustments } from "@/types";

export const cloneAdjustments = (value: EditingAdjustments) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as EditingAdjustments;
  }
  return JSON.parse(JSON.stringify(value)) as EditingAdjustments;
};
