import pluginId from '../pluginId';
import en from '../translations/en.json';

export default function getTrad(id: string) {
  const pluginIdWithId = `${pluginId}.${id}`;
  return {
    id: pluginIdWithId,
    defaultMessage: en[id as keyof typeof en] || pluginIdWithId,
  };
}
