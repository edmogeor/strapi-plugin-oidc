import type { StrapiContext } from '../types';
import { formatDatetimeForFilename } from './datetime';

export function setJsonAttachmentHeaders(ctx: StrapiContext, basename: string): void {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/json');
  ctx.set('Content-Disposition', `attachment; filename="${basename}-${datetime}.json"`);
}
