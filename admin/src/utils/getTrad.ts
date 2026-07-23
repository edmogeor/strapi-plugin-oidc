import pluginId from '../pluginId';
import en from '../../../translations/locales/en.json';

export { en };

export default function getTrad(id: string) {
  const pluginIdWithId = `${pluginId}.${id}`;
  return {
    id: pluginIdWithId,
    defaultMessage: en[id as keyof typeof en] || pluginIdWithId,
  };
}

export function t(id: keyof typeof en): string {
  return en[id];
}
