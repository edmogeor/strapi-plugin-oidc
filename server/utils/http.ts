import type { StrapiContext } from '../types';
import { formatDatetimeForFilename } from '../../shared/datetime';

export function setJsonAttachmentHeaders(ctx: StrapiContext, basename: string): void {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/json');
  ctx.set('Content-Disposition', `attachment; filename="${basename}-${datetime}.json"`);
}

export function setNdjsonAttachmentHeaders(ctx: StrapiContext, basename: string): void {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/x-ndjson; charset=utf-8');
  ctx.set('Content-Disposition', `attachment; filename="${basename}-${datetime}.ndjson"`);
  ctx.set('Cache-Control', 'no-store');
  ctx.set('X-Content-Type-Options', 'nosniff');
}
