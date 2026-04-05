import pluginId from '../pluginId';

export function getTranslation(id: string) {
  return `${pluginId}.${id}`;
}
