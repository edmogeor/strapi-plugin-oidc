/// <reference types="vite/client" />
// Build-time glob: every translations/locales/*.json is auto-registered.
// Drop a new locale file in that directory and it becomes available here with no code changes.
const modules = import.meta.glob('../translations/locales/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>;

const locales: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const code = path.match(/\/([^/]+)\.json$/)?.[1];
    return [code ?? '', mod.default];
  }),
);

const DEFAULT_LOCALE = 'en';

interface WeightedTag {
  tag: string;
  q: number;
}

function parseAcceptLanguage(header: string): WeightedTag[] {
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q);
}

export function negotiateLocale(acceptLanguage?: string | null): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const { tag } of parseAcceptLanguage(acceptLanguage)) {
    if (locales[tag]) return tag;
    const base = tag.split('-')[0];
    if (locales[base]) return base;
  }
  return DEFAULT_LOCALE;
}

export function t(locale: string, key: string, fallback?: string): string {
  return locales[locale]?.[key] ?? locales[DEFAULT_LOCALE]?.[key] ?? fallback ?? key;
}
