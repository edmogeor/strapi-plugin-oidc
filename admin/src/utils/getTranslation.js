import pluginId from '../pluginId';

export function getTranslation(id) {
  return `${pluginId}.${id}`;
}
