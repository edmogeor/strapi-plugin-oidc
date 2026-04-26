import { describe, it, expect, beforeAll } from 'vitest';
import { negotiateLocale, t } from '../../i18n';

describe('i18n', () => {
  describe('negotiateLocale', () => {
    it('returns en when no accept-language header is provided', () => {
      expect(negotiateLocale(undefined)).toBe('en');
      expect(negotiateLocale(null)).toBe('en');
      expect(negotiateLocale('')).toBe('en');
    });

    it('returns exact locale match when available', () => {
      expect(negotiateLocale('fr')).toBe('fr');
      expect(negotiateLocale('de')).toBe('de');
      expect(negotiateLocale('ja')).toBe('ja');
    });

    it('falls back to base language when variant is not available', () => {
      expect(negotiateLocale('pt-XX')).toBe('pt');
    });

    it('falls back to en when no match is found', () => {
      expect(negotiateLocale('xyz')).toBe('en');
    });

    it('prioritizes higher q values', () => {
      expect(negotiateLocale('fr;q=0.9,de;q=1')).toBe('de');
    });

    it('handles case-insensitive matching', () => {
      expect(negotiateLocale('FR')).toBe('fr');
      expect(negotiateLocale('DE;q=0.8')).toBe('de');
    });
  });

  describe('t', () => {
    it('returns translation for existing key and locale', () => {
      expect(t('en', 'page.save')).toBe('Save Changes');
      expect(t('fr', 'page.save')).toBe('Enregistrer les modifications');
      expect(t('de', 'page.save')).toBe('Änderungen speichern');
    });

    it('falls back to en when locale does not exist', () => {
      expect(t('xyz', 'page.save')).toBe('Save Changes');
    });

    it('falls back to key when key does not exist in any locale', () => {
      expect(t('xyz', 'nonexistent.key')).toBe('nonexistent.key');
    });

    it('translates all supported locales', () => {
      const locales = [
        'ar',
        'cs',
        'de',
        'dk',
        'es',
        'fr',
        'he',
        'id',
        'it',
        'ja',
        'ko',
        'ms',
        'nl',
        'no',
        'pl',
        'pt-BR',
        'pt',
        'ru',
        'sk',
        'sv',
        'th',
        'tr',
        'uk',
        'vi',
        'zh-Hans',
        'zh',
      ];
      for (const locale of locales) {
        expect(t(locale, 'page.save')).not.toBe('page.save');
      }
    });
  });

  describe('all locales have same keys', () => {
    const modules = import.meta.glob('../../translations/locales/*.json', {
      eager: true,
    }) as Record<string, { default: Record<string, string> }>;

    const localeData: Array<{ code: string; keys: Set<string> }> = [];
    const enKeys = new Set(
      Object.keys(modules['../../translations/locales/en.json']?.default ?? {}),
    );

    beforeAll(() => {
      for (const [path, mod] of Object.entries(modules)) {
        const code = path.match(/\/([^/]+)\.json$/)?.[1] ?? '';
        localeData.push({ code, keys: new Set(Object.keys(mod.default)) });
      }
    });

    it('every locale file has the same keys as en.json', () => {
      const missing: string[] = [];
      const extra: string[] = [];

      for (const { code, keys } of localeData) {
        if (code === 'en') continue;

        for (const key of enKeys) {
          if (!keys.has(key)) {
            missing.push(`${code}: missing "${key}"`);
          }
        }

        for (const key of keys) {
          if (!enKeys.has(key)) {
            extra.push(`${code}: extra "${key}"`);
          }
        }
      }

      expect(missing, `Missing keys:\n${missing.join('\n')}`).toHaveLength(0);
      expect(extra, `Extra keys:\n${extra.join('\n')}`).toHaveLength(0);
    });

    it('every locale file has the same number of keys as en.json', () => {
      for (const { code, keys } of localeData) {
        if (code === 'en') continue;
        expect(keys.size).toBe(
          enKeys.size,
          `"${code}" has ${keys.size} keys, expected ${enKeys.size}`,
        );
      }
    });
  });

  describe('translation values are not empty', () => {
    const modules = import.meta.glob('../../translations/locales/*.json', {
      eager: true,
    }) as Record<string, { default: Record<string, string> }>;

    it('no translation value is an empty string', () => {
      const emptyValues: string[] = [];

      for (const [path, mod] of Object.entries(modules)) {
        const code = path.match(/\/([^/]+)\.json$/)?.[1] ?? '';
        for (const [key, value] of Object.entries(mod.default)) {
          if (value.trim() === '') {
            emptyValues.push(`${code}: "${key}" is empty`);
          }
        }
      }

      expect(emptyValues, `Empty translation values:\n${emptyValues.join('\n')}`).toHaveLength(0);
    });
  });
});
