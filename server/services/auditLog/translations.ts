import en from '../../../translations/locales/en.json';

function interpolate(str: string, params?: Record<string, string>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export function translateDetails(key: string, params?: Record<string, string>): string | null {
  const translation = en[`audit.${key}` as keyof typeof en] as string | undefined;
  if (!translation) return null;
  return interpolate(translation, params);
}
