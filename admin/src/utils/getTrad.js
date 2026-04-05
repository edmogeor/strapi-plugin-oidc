import pluginId from '../pluginId';
import en from '../translations/en.json';

export default function getTrad(id) {
  const pluginIdWithId = `${pluginId}.${id}`;
  return {
    id: pluginIdWithId,
    defaultMessage: en[id] || pluginIdWithId,
  };
}
