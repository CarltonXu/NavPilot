export function possibleURL(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
  } catch { /* try a bare host */ }
  if (!/^(localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(:\d+)?(?:[/?#].*)?$/i.test(raw)) return '';
  try { return new URL(`https://${raw}`).href; } catch { return ''; }
}
