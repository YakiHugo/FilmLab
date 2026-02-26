export const MAX_TAGS_PER_ASSET = 20;
export const MAX_TAG_LENGTH = 24;

export const normalizeTag = (raw: string): string | null => {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) {
    return null;
  }
  if (value.length > MAX_TAG_LENGTH) {
    return null;
  }
  return value;
};

const toKey = (tag: string) => tag.toLocaleLowerCase();

export const normalizeTags = (tags: string[]): string[] => {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const normalized = normalizeTag(raw);
    if (!normalized) {
      continue;
    }
    const key = toKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(normalized);
    if (next.length >= MAX_TAGS_PER_ASSET) {
      break;
    }
  }

  return next;
};

export const mergeTags = (current: string[] | undefined, incoming: string[]) =>
  normalizeTags([...(current ?? []), ...incoming]);

export const removeTags = (current: string[] | undefined, removing: string[]) => {
  const normalizedCurrent = normalizeTags(current ?? []);
  if (normalizedCurrent.length === 0) {
    return [];
  }

  const removingKeys = new Set(normalizeTags(removing).map(toKey));
  if (removingKeys.size === 0) {
    return normalizedCurrent;
  }

  return normalizedCurrent.filter((tag) => !removingKeys.has(toKey(tag)));
};

export const hasAnyTag = (assetTags: string[] | undefined, selectedTags: string[]) => {
  if (!selectedTags.length) {
    return true;
  }
  if (!assetTags || assetTags.length === 0) {
    return false;
  }

  const assetKeys = new Set(normalizeTags(assetTags).map(toKey));
  for (const tag of normalizeTags(selectedTags)) {
    if (assetKeys.has(toKey(tag))) {
      return true;
    }
  }
  return false;
};

