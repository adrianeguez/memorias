import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolder, listFolders } from './googleApi';

const FAKE_TOKEN = 'tok-test';

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('googleApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listFolders', () => {
    it('retorna lista de carpetas de Drive', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse({ files: [{ id: 'f1', name: 'Mis Recuerdos' }] })
      );

      const folders = await listFolders(FAKE_TOKEN);

      expect(folders).toEqual([{ id: 'f1', name: 'Mis Recuerdos' }]);
    });

    it('retorna arreglo vacio si Drive no devuelve files', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({}));

      const folders = await listFolders(FAKE_TOKEN);

      expect(folders).toEqual([]);
    });
  });

  describe('createFolder', () => {
    it('crea carpeta y retorna FolderItem', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse({ id: 'new-id', name: 'Nueva Carpeta' })
      );

      const folder = await createFolder(FAKE_TOKEN, { name: 'Nueva Carpeta' });

      expect(folder.id).toBe('new-id');
      expect(folder.name).toBe('Nueva Carpeta');

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/drive/v3/files');
      expect(init.method).toBe('POST');
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.mimeType).toBe('application/vnd.google-apps.folder');
      expect(sentBody.name).toBe('Nueva Carpeta');
    });

    it('incluye parentId cuando se provee', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse({ id: 'child-id', name: 'Sub' })
      );

      await createFolder(FAKE_TOKEN, { name: 'Sub', parentId: 'parent-123' });

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.parents).toEqual(['parent-123']);
    });
  });

  describe('googleFetch retry', () => {
    it('reintenta en 429 y tiene exito al segundo intento', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response('Too Many Requests', {
            status: 429,
            headers: { 'content-type': 'text/plain' },
          })
        )
        .mockResolvedValueOnce(
          mockFetchResponse({ files: [] })
        );

      // Acelerar el timer de espera
      vi.useFakeTimers();
      const promise = listFolders(FAKE_TOKEN);
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(result).toEqual([]);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it('lanza error en fallo no reintentable (400)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Bad Request', {
          status: 400,
          headers: { 'content-type': 'text/plain' },
        })
      );

      await expect(listFolders(FAKE_TOKEN)).rejects.toThrow('Bad Request');
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('lanza error despues de 3 intentos fallidos en 503', async () => {
      // Crear nueva Response por cada llamada (el body solo se puede leer una vez)
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(
          new Response('Service Unavailable', {
            status: 503,
            headers: { 'content-type': 'text/plain' },
          })
        )
      );

      vi.useFakeTimers();
      const promise = listFolders(FAKE_TOKEN);
      // Adjuntar el handler ANTES de correr timers para evitar unhandled rejection
      const assertion = expect(promise).rejects.toThrow();
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      await assertion;
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    });
  });
});
