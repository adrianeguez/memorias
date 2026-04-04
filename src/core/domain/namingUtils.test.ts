import { describe, expect, it } from 'vitest';
import { buildMediaFileName, getMediaKindFromMimeType } from './namingUtils';

describe('namingUtils', () => {
  it('construye nombre de archivo con formato esperado', () => {
    const name = buildMediaFileName('2026-04-03', 'image', 1712100000000, 'abc123');
    expect(name).toBe('2026-04-03-image-1712100000000-abc123');
  });

  it('detecta kind video por mimeType', () => {
    expect(getMediaKindFromMimeType('video/mp4')).toBe('video');
  });

  it('detecta image por default en mimeType no video', () => {
    expect(getMediaKindFromMimeType('image/jpeg')).toBe('image');
  });
});
