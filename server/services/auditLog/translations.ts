import { interpolate } from '../../../shared/utils';
import en from '../../../translations/locales/en.json';

export function translateDetails(key: string, params?: Record<string, string>): string | null {
  const translation = en[`audit.${key}` as keyof typeof en] as string | undefined;
  if (!translation) return null;
  return interpolate(translation, params);
}
