export type MediaKind = 'image' | 'video';

export function getMediaKindFromMimeType(mimeType: string): MediaKind {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

export function buildMediaFileName(
  dateKey: string,
  kind: MediaKind,
  epochMs: number,
  entropy: string
): string {
  return `${dateKey}-${kind}-${epochMs}-${entropy}`;
}
