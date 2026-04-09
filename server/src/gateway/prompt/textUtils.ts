export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const dedupeStrings = (values: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values.map(normalizeText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(value);
  }
  return next;
};
