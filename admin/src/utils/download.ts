import { formatDatetimeForFilename } from '../../../shared/datetime';

export function downloadJson(basename: string, data: unknown): void {
  const datetime = formatDatetimeForFilename(new Date());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${basename}-${datetime}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
