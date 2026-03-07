import type { EditingAdjustments } from "@/types";

type NumericKeyOf<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T];

export type NumericAdjustmentKey = NumericKeyOf<EditingAdjustments>;
