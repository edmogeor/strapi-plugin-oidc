/// <reference types="vite/client" />
const modules = import.meta.glob('../translations/locales/*.json', { eager: true });

function isLocaleModule(value: unknown): value is { default: Record<string, string> } {
  if (typeof value !== 'object' || value === null) return false;
  const defaultValue = Object.entries(value).find(([k]) => k === 'default')?.[1];
  if (typeof defaultValue !== 'object' || defaultValue === null) return false;
  return Object.values(defaultValue).every((v) => typeof v === 'string');
}

const locales: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(modules)
    .map(([path, mod]) => {
      const code = path.match(/\/([^/]+)\.json$/)?.[1];
      if (!code || !isLocaleModule(mod)) return null;
      return [code, mod.default];
    })
    .filter((entry): entry is [string, Record<string, string>] => entry !== null),
);

const DEFAULT_LOCALE = 'en';

interface WeightedTag {
  tag: string;
  q: number;
}

function parseAcceptLanguage(header: string): WeightedTag[] {
  return header
    .split(',')
    .reduce<WeightedTag[]>((acc, part) => {
      const match = part.trim().match(/^([^;]+)(?:;q=([\d.]+))?/i);
      if (!match) return acc;
      const q = match[2] ? Number(match[2]) : 1;
      acc.push({ tag: match[1].toLowerCase(), q: Number.isFinite(q) ? q : 1 });
      return acc;
    }, [])
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

export function getLocaleFromContext(ctx: {
  request: { headers: { 'accept-language'?: string | string[] } };
}): string {
  const header = ctx.request.headers['accept-language'];
  const acceptLanguage = Array.isArray(header) ? header[0] : header;
  return negotiateLocale(acceptLanguage);
}

export function t(locale: string, key: string, fallback?: string): string {
  return locales[locale]?.[key] ?? locales[DEFAULT_LOCALE]?.[key] ?? fallback ?? key;
}
