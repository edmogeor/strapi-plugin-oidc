import pluginId from '../pluginId';
import en from '../translations/en.json';

export { en };

export default function getTrad(id: string) {
  const pluginIdWithId = `${pluginId}.${id}`;
  return {
    id: pluginIdWithId,
    defaultMessage: en[id as keyof typeof en] || pluginIdWithId,
  };
}

/** Returns the English string for a translation key — for use outside React components. */
export function t(id: keyof typeof en): string {
  return en[id];
}
