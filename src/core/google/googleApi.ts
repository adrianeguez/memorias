import { formatDateKey, isValidSheetFileName } from '../domain/dateUtils';
import type { MemoryRecord, WeekRange } from '../domain/dateUtils';
import { buildMediaFileName, getMediaKindFromMimeType } from '../domain/namingUtils';

interface GoogleFetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType?: string;
}

interface GoogleDriveFilesResponse {
  files?: GoogleDriveFile[];
}

interface GoogleSheetValuesResponse {
  values?: string[][];
}

interface UploadResponse {
  id: string;
  mimeType?: string;
}

export interface FolderItem {
  id: string;
  name: string;
}

export interface CreateFolderPayload {
  name: string;
  parentId?: string;
}

export interface AppendMemoryPayload {
  title: string;
  description: string;
  urls: string[];
}

let identityScriptPromise: Promise<void> | undefined;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function loadGoogleIdentityScript() {
  if (identityScriptPromise) return identityScriptPromise;

  identityScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });

  return identityScriptPromise;
}

async function googleFetch<T>(url: string, token: string, options: GoogleFetchOptions = {}): Promise<T> {
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      const shouldRetry = RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts - 1;
      if (shouldRetry) {
        await wait(300 * 2 ** attempt);
        attempt += 1;
        continue;
      }

      throw new Error(text || `Google API error: ${response.status}`);
    }

    if (response.status === 204) return null as T;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    return (response.text() as unknown) as T;
  }

  throw new Error('Google API error no recuperable.');
}

export async function listFolders(token: string): Promise<FolderItem[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100`;
  const data = await googleFetch<GoogleDriveFilesResponse>(url, token);
  return data.files || [];
}

export async function createFolder(token: string, payload: CreateFolderPayload): Promise<FolderItem> {
  const body = {
    name: payload.name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(payload.parentId ? { parents: [payload.parentId] } : {}),
  };

  return googleFetch<FolderItem>('https://www.googleapis.com/drive/v3/files?fields=id,name', token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function listDateNamedSheets(token: string, folderId: string): Promise<GoogleDriveFile[]> {
  const query = [
    `'${folderId}' in parents`,
    "mimeType='application/vnd.google-apps.spreadsheet'",
    'trashed=false',
  ].join(' and ');
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=500`;
  const data = await googleFetch<GoogleDriveFilesResponse>(url, token);

  return (data.files || []).filter((file) => isValidSheetFileName(file.name));
}

async function readSheetRows(token: string, spreadsheetId: string): Promise<string[][]> {
  const range = encodeURIComponent('A2:I');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const data = await googleFetch<GoogleSheetValuesResponse>(url, token);
  return data.values || [];
}

function rowsToMemories(rows: string[][], dateKey: string, sheetId: string): MemoryRecord[] {
  return rows
    .filter((row) => {
      const title = row[1]?.trim();
      const description = row[2]?.trim();
      const hasUrls = row.slice(3, 8).some((value) => Boolean(value));
      return Boolean(title || description || hasUrls);
    })
    .map((row, index) => {
    const urls = row.slice(3, 8).filter(Boolean);
    return {
      uniqueKey: `${sheetId}-${row[0] || index}`,
      id: row[0] || `unknown-${index}`,
      title: row[1] || 'Sin titulo',
      description: row[2] || 'Sin descripcion',
      urls,
      dateKey,
      createdAtIso: row[8] || '',
      sheetId,
    };
    });
}

export async function listMonthlyMemories(
  token: string,
  folderId: string,
  year: number,
  month: number
): Promise<MemoryRecord[]> {
  const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
  const sheets = await listDateNamedSheets(token, folderId);
  const monthlySheets = sheets.filter((sheet) => sheet.name.startsWith(datePrefix));

  const chunks = await Promise.all(
    monthlySheets.map(async (sheet) => {
      const rows = await readSheetRows(token, sheet.id);
      return rowsToMemories(rows, sheet.name, sheet.id);
    })
  );

  return chunks.flat();
}

export async function listWeekMemories(
  token: string,
  folderId: string,
  weekRange: WeekRange
): Promise<MemoryRecord[]> {
  const sheets = await listDateNamedSheets(token, folderId);
  const startTs = weekRange.start.getTime();
  const endTs = weekRange.end.getTime();

  const filteredSheets = sheets.filter((sheet) => {
    const ts = new Date(`${sheet.name}T00:00:00`).getTime();
    return ts >= startTs && ts <= endTs;
  });

  const chunks = await Promise.all(
    filteredSheets.map(async (sheet) => {
      const rows = await readSheetRows(token, sheet.id);
      return rowsToMemories(rows, sheet.name, sheet.id);
    })
  );

  return chunks.flat();
}

async function createSpreadsheetInFolder(token: string, folderId: string, dateKey: string): Promise<string> {
  const body = {
    name: dateKey,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId],
  };

  const file = await googleFetch<GoogleDriveFile>(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent('A1:I1')}`,
    token,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [['id', 'title', 'description', 'url1', 'url2', 'url3', 'url4', 'url5', 'createdAtIso']],
      }),
    }
  );

  return file.id;
}

export async function ensureDailySheet(
  token: string,
  folderId: string,
  dateKey = formatDateKey(new Date())
): Promise<string> {
  const query = [
    `'${folderId}' in parents`,
    "mimeType='application/vnd.google-apps.spreadsheet'",
    `name='${dateKey}'`,
    'trashed=false',
  ].join(' and ');

  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`;
  const existing = await googleFetch<GoogleDriveFilesResponse>(listUrl, token);
  if (existing.files && existing.files.length > 0) {
    return existing.files[0].id;
  }

  return createSpreadsheetInFolder(token, folderId, dateKey);
}

function randomSuffix() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(-6);
  }
  return Math.random().toString(16).slice(2, 8);
}

function buildMediaName(file: File, today: Date): string {
  const dateKey = formatDateKey(today);
  const kind = getMediaKindFromMimeType(file.type);
  return buildMediaFileName(dateKey, kind, Date.now(), randomSuffix());
}

async function uploadSingleFile(token: string, folderId: string, file: File, today: Date): Promise<string> {
  const metadata = {
    name: buildMediaName(file, today),
    parents: [folderId],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const data = await googleFetch<UploadResponse>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType',
    token,
    {
      method: 'POST',
      body: formData,
    }
  );

  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${data.id}/permissions`,
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  const kind = data.mimeType?.startsWith('video/') ? 'video' : 'image';
  return `https://drive.google.com/file/d/${data.id}/view?kind=${kind}`;
}

export async function uploadMediaFiles(
  token: string,
  folderId: string,
  files: File[],
  today = new Date()
): Promise<string[]> {
  if (!files.length) return [];
  const urls = [];

  for (const file of files) {
    const url = await uploadSingleFile(token, folderId, file, today);
    urls.push(url);
  }

  return urls;
}

export async function appendMemoryRow(
  token: string,
  spreadsheetId: string,
  { title, description, urls }: AppendMemoryPayload
): Promise<void> {
  const now = new Date().toISOString();
  const row = [
    `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    description,
    ...(urls || []).slice(0, 5),
  ];

  while (row.length < 8) {
    row.push('');
  }

  row.push(now);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    'A2:I'
  )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  await googleFetch(url, token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });
}
