import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  formatDateKey,
  getWeekRangeMondaySunday,
  groupMemoriesByDay,
  sortMemoriesPresentToPast,
} from './core/domain/dateUtils';
import type { DayLabel, MemoryRecord } from './core/domain/dateUtils';
import { validateMemoryInput } from './core/domain/validation';
import {
  ensureDailySheet,
  createFolder,
  listFolders,
  listMonthlyMemories,
  listWeekMemories,
  uploadMediaFiles,
  appendMemoryRow,
  loadGoogleIdentityScript,
} from './core/google/googleApi';
import type { FolderItem } from './core/google/googleApi';

type AppView = 'setup' | 'timeline' | 'week' | 'create';

interface MediaPreviewProps {
  url: string;
  token: string;
  onOpen?: () => void;
  variant?: 'grid' | 'viewer';
}

interface MediaViewerState {
  urls: string[];
  index: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (_options: { prompt: string }) => void;
}

const GOOGLE_SCOPE = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);
const MAX_DESCRIPTION_PREVIEW = 600;

function getDriveId(url: string): string {
  if (!url) return '';
  const slashMatch = url.match(/\/d\/([^/]+)/);
  if (slashMatch) return slashMatch[1];
  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch) return idMatch[1];
  return '';
}

function getKindFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('kind') || 'asset';
  } catch {
    return 'asset';
  }
}

function getPreviewDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DESCRIPTION_PREVIEW) return trimmed;
  return `${trimmed.slice(0, MAX_DESCRIPTION_PREVIEW).trimEnd()}...`;
}

function MediaPreview({ url, token, onOpen, variant = 'grid' }: MediaPreviewProps) {
  const id = getDriveId(url);
  const kind = getKindFromUrl(url);
  const [blobUrl, setBlobUrl] = useState('');
  const [failedToLoad, setFailedToLoad] = useState(false);
  const imageClassName = variant === 'viewer' ? 'asset-image asset-image-viewer' : 'asset-image';
  const videoClassName = variant === 'viewer' ? 'asset-video asset-video-viewer' : 'asset-video';

  useEffect(() => {
    if (!id || kind !== 'image' || !token) {
      setBlobUrl('');
      setFailedToLoad(false);
      return;
    }

    let isMounted = true;
    let objectUrl = '';

    async function loadImage() {
      try {
        setFailedToLoad(false);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('No se pudo descargar imagen desde Drive.');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isMounted) {
          setBlobUrl(objectUrl);
        }
      } catch {
        if (isMounted) {
          setFailedToLoad(true);
          setBlobUrl('');
        }
      }
    }

    loadImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, kind, token]);

  if (!id) {
    return (
      <a className="asset-link" href={url} target="_blank" rel="noreferrer">
        Ver archivo
      </a>
    );
  }

  if (kind === 'image') {
    if (blobUrl) {
      if (onOpen) {
        return (
          <button className="asset-plain-button" type="button" onClick={onOpen} aria-label="Ver imagen en carrusel">
            <img
              className={imageClassName}
              src={blobUrl}
              alt="Recuerdo"
            />
          </button>
        );
      }

      return (
        <img
          className={imageClassName}
          src={blobUrl}
          alt="Recuerdo"
        />
      );
    }

    if (failedToLoad) {
      return (
        <a className="asset-link" href={url} target="_blank" rel="noreferrer">
          Abrir imagen en Drive
        </a>
      );
    }

    return (
      <div className="asset-link" aria-label="Cargando imagen">
        Cargando imagen...
      </div>
    );
  }

  if (kind === 'video') {
    if (onOpen) {
      return (
        <button className="asset-link asset-plain-button" type="button" onClick={onOpen}>
          Ver video
        </button>
      );
    }

    return (
      <iframe
        className={videoClassName}
        src={`https://drive.google.com/file/d/${id}/preview`}
        allow="autoplay"
        title="Video del recuerdo"
      />
    );
  }

  return (
    <a className="asset-link" href={url} target="_blank" rel="noreferrer">
      Abrir archivo en Drive
    </a>
  );
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [token, setToken] = useState('');
  const [view, setView] = useState<AppView>('setup');

  const [folderId, setFolderId] = useState(localStorage.getItem('archive.folderId') || '');
  const [folderName, setFolderName] = useState(localStorage.getItem('archive.folderName') || '');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState('');

  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedWeekDate, setSelectedWeekDate] = useState(new Date());
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekMemories, setWeekMemories] = useState<MemoryRecord[]>([]);
  const [weekError, setWeekError] = useState('');

  const [title, setTitle] = useState(localStorage.getItem('archive.draft.title') || '');
  const [description, setDescription] = useState(localStorage.getItem('archive.draft.description') || '');
  const [files, setFiles] = useState<File[]>([]);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedMemory, setExpandedMemory] = useState<MemoryRecord | null>(null);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);

  const tokenClientRef = useRef<GoogleTokenClient | null>(null);

  const weekRange = useMemo(() => getWeekRangeMondaySunday(selectedWeekDate), [selectedWeekDate]);
  const groupedWeek = useMemo(
    () => groupMemoriesByDay(sortMemoriesPresentToPast(weekMemories), weekRange),
    [weekMemories, weekRange]
  );

  useEffect(() => {
    localStorage.setItem('archive.draft.title', title);
  }, [title]);

  useEffect(() => {
    localStorage.setItem('archive.draft.description', description);
  }, [description]);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!googleClientId) {
        setAuthError('Falta VITE_GOOGLE_CLIENT_ID en variables de entorno.');
        return;
      }

      try {
        await loadGoogleIdentityScript();
        if (!window.google?.accounts?.oauth2) {
          throw new Error('No se pudo inicializar Google Identity Services.');
        }

        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: GOOGLE_SCOPE,
          callback: (response: GoogleTokenResponse) => {
            if (response?.error) {
              setAuthError('No fue posible iniciar sesión con Google.');
              return;
            }

            if (!response.access_token) {
              setAuthError('No se recibió token de acceso de Google.');
              return;
            }

            setToken(response.access_token);
            setAuthError('');
            if (folderId) {
              setView('timeline');
            }
          },
        });

        if (isMounted) {
          setAuthReady(true);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al cargar autenticación de Google.';
        setAuthError(message);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [googleClientId, folderId]);

  useEffect(() => {
    if (!token) return;

    async function fetchFolders() {
      setFoldersLoading(true);
      try {
        const nextFolders = await listFolders(token);
        setFolders(nextFolders);
      } catch {
        setAuthError('No se pudieron cargar las carpetas de Google Drive.');
      } finally {
        setFoldersLoading(false);
      }
    }

    fetchFolders();
  }, [token]);

  useEffect(() => {
    if (!token || !folderId) return;

    async function fetchTimeline() {
      setTimelineLoading(true);
      setTimelineError('');
      try {
        const data = await listMonthlyMemories(token, folderId, year, month);
        setMemories(sortMemoriesPresentToPast(data));
      } catch {
        setTimelineError('No fue posible cargar la línea de tiempo para este mes.');
        setMemories([]);
      } finally {
        setTimelineLoading(false);
      }
    }

    fetchTimeline();
  }, [token, folderId, year, month]);

  useEffect(() => {
    if (!token || !folderId || view !== 'week') return;

    async function fetchWeek() {
      setWeekLoading(true);
      setWeekError('');
      try {
        const data = await listWeekMemories(token, folderId, weekRange);
        setWeekMemories(sortMemoriesPresentToPast(data));
      } catch {
        setWeekError('No fue posible cargar recuerdos de esta semana.');
        setWeekMemories([]);
      } finally {
        setWeekLoading(false);
      }
    }

    fetchWeek();
  }, [token, folderId, view, weekRange]);

  function handleSignIn() {
    if (!tokenClientRef.current) return;
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  }

  function handleFolderSelect(folder: FolderItem) {
    setFolderId(folder.id);
    setFolderName(folder.name);
    setFolderError('');
    localStorage.setItem('archive.folderId', folder.id);
    localStorage.setItem('archive.folderName', folder.name);
    setView('timeline');
  }

  async function handleCreateFolder() {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setFolderError('Escribe un nombre de carpeta para crearla.');
      return;
    }

    if (!token) {
      setFolderError('Primero conecta tu cuenta de Google.');
      return;
    }

    setIsCreatingFolder(true);
    setFolderError('');
    try {
      const folder = await createFolder(token, { name: trimmedName });
      setFolders((prev) => [folder, ...prev]);
      setNewFolderName('');
      handleFolderSelect(folder);
    } catch {
      setFolderError('No se pudo crear la carpeta en Drive.');
    } finally {
      setIsCreatingFolder(false);
    }
  }

  function goToCreate() {
    setShowFilters(false);
    setExpandedMemory(null);
    setMediaViewer(null);
    setView('create');
  }

  async function saveMemory() {
    setSaveError('');

    const validation = validateMemoryInput({ title, description, files });
    if (!validation.valid) {
      setSaveError(validation.errors.join(' '));
      return;
    }

    if (!token || !folderId) {
      setSaveError('Debes iniciar sesión y seleccionar una carpeta primero.');
      return;
    }

    setIsSaving(true);
    try {
      const today = new Date();
      const dateKey = formatDateKey(today);
      const mediaUrls = await uploadMediaFiles(token, folderId, files, today);
      const sheetId = await ensureDailySheet(token, folderId, dateKey);

      await appendMemoryRow(token, sheetId, {
        title,
        description,
        urls: mediaUrls,
      });

      setTitle('');
      setDescription('');
      setFiles([]);
      localStorage.removeItem('archive.draft.title');
      localStorage.removeItem('archive.draft.description');
      setView('timeline');

      const data = await listMonthlyMemories(token, folderId, year, month);
      setMemories(sortMemoriesPresentToPast(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setSaveError(message ? `No fue posible guardar el recuerdo. ${message}` : 'No fue posible guardar el recuerdo. Reintenta.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveMemorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveMemory();
  }

  function openMediaViewer(urls: string[], index: number) {
    if (!urls.length) return;
    const safeIndex = Math.min(Math.max(index, 0), urls.length - 1);
    setMediaViewer({ urls, index: safeIndex });
  }

  function moveMediaViewer(direction: -1 | 1) {
    setMediaViewer((prev) => {
      if (!prev || prev.urls.length === 0) return prev;
      const nextIndex = (prev.index + direction + prev.urls.length) % prev.urls.length;
      return { ...prev, index: nextIndex };
    });
  }

  const hasSetupDone = token && folderId;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="brand">The Archive</p>
          <h1>{view === 'week' ? 'Vista Semanal' : view === 'create' ? 'Nuevo Recuerdo' : 'Timeline'}</h1>
        </div>
        {folderName ? <span className="pill">{folderName}</span> : null}
      </header>

      {view === 'setup' ? (
        <main className="page">
          <section className="card">
            <h2>Acceso y Configuración</h2>
            <p>Conecta Google y elige la carpeta donde se guardarán tus recuerdos diarios.</p>
            {!token ? (
              <button className="primary" type="button" onClick={handleSignIn} disabled={!authReady}>
                {authReady ? 'Conectar con Google' : 'Cargando Google...'}
              </button>
            ) : (
              <p className="ok">Google conectado.</p>
            )}
            {authError ? <p className="error">{authError}</p> : null}
          </section>

          {token ? (
            <section className="card">
              <h3>Selecciona carpeta de Drive</h3>
              {foldersLoading ? <p>Cargando carpetas...</p> : null}
              <div className="folder-create-row">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nueva carpeta"
                  aria-label="Nombre de nueva carpeta"
                />
                <button className="ghost" type="button" onClick={handleCreateFolder} disabled={isCreatingFolder}>
                  {isCreatingFolder ? 'Creando...' : 'Crear'}
                </button>
              </div>
              {folderError ? <p className="error">{folderError}</p> : null}
              <div className="folder-list">
                {folders.map((folder) => (
                  <button
                    className={`folder-item ${folder.id === folderId ? 'selected' : ''}`}
                    type="button"
                    key={folder.id}
                    onClick={() => handleFolderSelect(folder)}
                  >
                    {folder.name}
                  </button>
                ))}
                {!foldersLoading && folders.length === 0 ? <p>No se encontraron carpetas.</p> : null}
              </div>
            </section>
          ) : null}

          <button
            className="primary"
            type="button"
            disabled={!hasSetupDone}
            onClick={() => setView('timeline')}
          >
            Completar configuración
          </button>
        </main>
      ) : null}

      {view === 'timeline' ? (
        <main className="page">
          <section className="filters-row">
            <button className="primary" type="button" onClick={goToCreate}>
              Nuevo recuerdo
            </button>
            <button className="ghost" type="button" onClick={() => setShowFilters(true)}>
              Filtrar mes/año
            </button>
            <button className="ghost" type="button" onClick={() => setView('setup')}>
              Configuración
            </button>
          </section>

          {timelineLoading ? <p>Cargando recuerdos...</p> : null}
          {timelineError ? <p className="error">{timelineError}</p> : null}

          {!timelineLoading && memories.length === 0 ? (
            <section className="card">
              <p>Aún no hay recuerdos este mes.</p>
            </section>
          ) : null}

          <section className="timeline-list">
            {memories.map((memory) => (
              <article key={memory.uniqueKey} className="memory-card">
                <div className="memory-head">
                  <p className="meta">{memory.dateKey}</p>
                  <button
                    className="tiny"
                    type="button"
                    onClick={() => {
                      setSelectedWeekDate(new Date(`${memory.dateKey}T00:00:00`));
                      setView('week');
                    }}
                  >
                    Ver semana
                  </button>
                </div>
                <h3>{memory.title}</h3>
                <p>{getPreviewDescription(memory.description)}</p>
                {memory.description.trim().length > MAX_DESCRIPTION_PREVIEW ? (
                  <button className="tiny" type="button" onClick={() => setExpandedMemory(memory)}>
                    Leer completo
                  </button>
                ) : null}
                {memory.urls.length ? (
                  <div className="asset-grid">
                    {memory.urls.slice(0, 2).map((url, index) => (
                      <MediaPreview
                        key={url}
                        url={url}
                        token={token}
                        onOpen={() => openMediaViewer(memory.urls, index)}
                      />
                    ))}
                    {memory.urls.length > 2 ? (
                      <button
                        className="asset-more-btn"
                        type="button"
                        onClick={() => openMediaViewer(memory.urls, 2)}
                      >
                        +{memory.urls.length - 2} más
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </main>
      ) : null}

      {view === 'week' ? (
        <main className="page">
          <section className="card">
            <p className="meta">{weekRange.startKey} a {weekRange.endKey}</p>
            <button className="ghost" type="button" onClick={() => setView('timeline')}>
              Volver a timeline
            </button>
          </section>

          {weekLoading ? <p>Cargando semana...</p> : null}
          {weekError ? <p className="error">{weekError}</p> : null}

          {(Object.entries(groupedWeek) as [DayLabel, MemoryRecord[]][]).map(([day, items]) => (
            <section key={day} className="card">
              <h3>{day}</h3>
              {items.length === 0 ? <p className="meta">Sin recuerdos.</p> : null}
              {items.map((memory) => (
                <article key={memory.uniqueKey} className="memory-item">
                  <h4>{memory.title}</h4>
                  <p>{getPreviewDescription(memory.description)}</p>
                  {memory.description.trim().length > MAX_DESCRIPTION_PREVIEW ? (
                    <button className="tiny" type="button" onClick={() => setExpandedMemory(memory)}>
                      Leer completo
                    </button>
                  ) : null}
                  {memory.urls.length ? (
                    <div className="asset-grid">
                      {memory.urls.map((url, index) => (
                        <MediaPreview
                          key={url}
                          url={url}
                          token={token}
                          onOpen={() => openMediaViewer(memory.urls, index)}
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ))}
        </main>
      ) : null}

      {view === 'create' ? (
        <main className="page">
          <form className="card" onSubmit={handleSaveMemorySubmit}>
            <label htmlFor="title">Título</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />

            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />

            <label htmlFor="files">Fotos o videos (máx. 5)</label>
            <input
              id="files"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <p className="meta">Seleccionados: {files.length}</p>

            {saveError ? <p className="error">{saveError}</p> : null}
            <button className="primary" type="button" disabled={isSaving} onClick={() => void saveMemory()}>
              {isSaving ? 'Guardando...' : 'Guardar Recuerdo'}
            </button>
            <button className="ghost" type="button" onClick={() => setView('timeline')}>
              Cancelar
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setTitle('');
                setDescription('');
                localStorage.removeItem('archive.draft.title');
                localStorage.removeItem('archive.draft.description');
              }}
            >
              Limpiar borrador
            </button>
          </form>
        </main>
      ) : null}

      {showFilters ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <section className="dialog">
            <h3>Filtrar por mes y año</h3>
            <label htmlFor="month">Mes</label>
            <select id="month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>

            <label htmlFor="year">Año</label>
            <select id="year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <div className="dialog-actions">
              <button className="primary" type="button" onClick={() => setShowFilters(false)}>
                Aplicar
              </button>
              <button className="ghost" type="button" onClick={() => setShowFilters(false)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {expandedMemory ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" onClick={() => setExpandedMemory(null)}>
          <section className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{expandedMemory.title}</h3>
            <p className="meta">{expandedMemory.dateKey}</p>
            <p className="full-description">{expandedMemory.description}</p>
            <div className="dialog-actions">
              <button className="primary" type="button" onClick={() => setExpandedMemory(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {mediaViewer ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" onClick={() => setMediaViewer(null)}>
          <section className="dialog media-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>Multimedia del recuerdo</h3>
            <p className="meta">
              {mediaViewer.index + 1} de {mediaViewer.urls.length}
            </p>

            <MediaPreview
              url={mediaViewer.urls[mediaViewer.index]}
              token={token}
              variant="viewer"
            />

            <div className="dialog-actions">
              <button className="ghost" type="button" onClick={() => moveMediaViewer(-1)}>
                Anterior
              </button>
              <button className="ghost" type="button" onClick={() => moveMediaViewer(1)}>
                Siguiente
              </button>
              <button className="primary" type="button" onClick={() => setMediaViewer(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className="bottom-nav">
        <button className={view === 'timeline' ? 'active' : ''} type="button" onClick={() => setView('timeline')}>
          Timeline
        </button>
        <button className={view === 'create' ? 'active' : ''} type="button" onClick={goToCreate}>
          Crear
        </button>
        <button className={view === 'week' ? 'active' : ''} type="button" onClick={() => setView('week')}>
          Semana
        </button>
      </nav>
    </div>
  );
}

export default App;
