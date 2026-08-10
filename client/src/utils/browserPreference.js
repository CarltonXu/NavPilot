export function browserPreference(cachedValue, accountDefault, fallback) {
  return cachedValue === null || cachedValue === undefined
    ? accountDefault || fallback
    : cachedValue;
}
