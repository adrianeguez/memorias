# Plan V1 Sprint 1 - The Archive (Mobile)

## 1. Objetivo del sprint (entregar todo el MVP)

Entregar en un solo sprint una app web mobile-first que:

- Autentique con Google.
- Permita seleccionar carpeta destino en Drive.
- Cree/lea un Google Sheet diario con nombre `YYYY-MM-DD`.
- Permita crear recuerdos con `id`, `titulo`, `descripcion` y hasta 5 URLs de media.
- Suba media a Drive con naming estandarizado.
- Muestre timeline por mes/anio (presente a pasado).
- Muestre vista semanal (lunes a domingo) agrupada por dia.

Sin backend propio, sin base de datos externa. Todo persiste en Drive/Sheets del usuario.

---

## 2. Arquitectura propuesta (simple y rapida)

## 2.1 Estilo

- SPA React + Vite.
- Integracion directa con Google APIs desde frontend.
- Persistencia local minima: `localStorage` para `folderId`, `folderName`, preferencias UI.
- Persistencia principal: Google Drive + Google Sheets.

## 2.2 Capas

- `core/auth`: login, estado de sesion, refresh de token UI-driven.
- `core/google`: cliente para Drive/Sheets.
- `core/domain`: reglas de negocio (nombres, fechas, semanas, validaciones).
- `features/setup`: onboarding (login + seleccion carpeta).
- `features/timeline`: listado mensual y filtros.
- `features/week`: agrupacion semanal.
- `features/memory-create`: formulario + upload + guardado.
- `features/ui`: componentes compartidos y layout movil.

## 2.3 Flujo principal

1. Usuario inicia sesion con Google.
2. Usuario selecciona carpeta de Drive.
3. App guarda `folderId` localmente.
4. Timeline carga archivos del mes en esa carpeta filtrando por naming `YYYY-MM-DD`.
5. Al crear recuerdo:
- Se suben hasta 5 archivos (imagenes/videos) a la carpeta.
- Se crea (o reutiliza) el Sheet diario.
- Se agrega fila con metadata y URLs.

---

## 3. Modelo de datos y convenciones

## 3.1 Archivo diario (Google Sheet)

- Nombre: `YYYY-MM-DD` (ejemplo `2026-04-02`).
- Ubicacion: carpeta seleccionada por usuario.
- Hoja principal: `Memories`.

## 3.2 Columnas del sheet

- `id` (string unico, ejemplo `mem-<Date.now()>-<random>`)
- `title`
- `description`
- `url1`
- `url2`
- `url3`
- `url4`
- `url5`
- `createdAtIso`

## 3.3 Naming media

- `YYYY-MM-DD-image-<Date.now()>-<entropy>`
- `YYYY-MM-DD-video-<Date.now()>-<entropy>`

`entropy` recomendado: ultimos 6 caracteres de `crypto.randomUUID()`.

---

## 4. Requisitos de Google API (minimos)

## 4.1 APIs a habilitar en Google Cloud

- Google Drive API
- Google Sheets API

## 4.2 Credenciales

- OAuth Client (Web) para GIS (sign-in)
- API Key para llamadas REST/gapi segun estrategia

## 4.3 Scopes recomendados (MVP)

- `openid`
- `profile`
- `email`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.metadata.readonly`

Nota: si necesitan listar y leer archivos preexistentes en una carpeta sin restricciones, puede requerirse `drive` scope completo. Empezar con scopes minimos y escalar solo si bloquea el flujo.

---

## 5. Revision pantalla a pantalla (diseno actual + edge cases)

## 5.1 Pantalla: Acceso y Configuracion

Objetivo funcional:

- Login Google.
- Seleccion de carpeta Drive.
- Confirmar setup completo.

Edge cases criticos:

- Usuario cancela login.
- Token expirado en mitad del setup.
- Usuario niega scopes de Drive/Sheets.
- Usuario elige carpeta sin permisos de escritura.
- Sin internet durante seleccion de carpeta.
- `folderId` guardado localmente pero carpeta eliminada luego.

Comportamiento esperado:

- Mostrar estados claros: `Conectando`, `Conectado`, `Error`, `Reintentar`.
- Boton `Completar configuracion` habilitado solo si `auth + folderId` validos.
- Validar acceso de escritura con una prueba ligera antes de continuar.

## 5.2 Pantalla: Linea de Tiempo

Objetivo funcional:

- Listar recuerdos de presente a pasado por mes/anio.
- Abrir detalle semanal.

Edge cases criticos:

- Mes sin sheets.
- Sheets con formato incorrecto de nombre.
- Filas incompletas (sin titulo/descripcion).
- URLs invalidas o rotas.
- Orden cronologico ambiguo por timezone.

Comportamiento esperado:

- Estado vacio amigable: `Aun no hay recuerdos este mes`.
- Ignorar archivos no `YYYY-MM-DD`.
- Orden deterministico por fecha local configurada.
- Fallback visual para media no disponible.

## 5.3 Pantalla: Vista Semanal

Objetivo funcional:

- Mostrar semana lunes-domingo agrupando por dia.
- Renderizar cards con titulo, descripcion, media.

Edge cases criticos:

- Semana que cruza mes/anio.
- Dias sin recuerdos en medio de semana.
- Multiples sheets mal nombrados para la misma fecha.
- Videos pesados en red movil lenta.

Comportamiento esperado:

- Etiquetas de dia claras (Lun...Dom).
- Dias sin items se muestran colapsados o con placeholder.
- Lazy load de media para rendimiento movil.
- Reproduccion de video bajo demanda (no autoplay).

## 5.4 Pantalla: Crear Recuerdo

Objetivo funcional:

- Crear recuerdo del dia actual.
- Adjuntar hasta 5 archivos (foto/video).
- Guardar fila en Sheet diario.

Edge cases criticos:

- Intento de subir 6+ archivos.
- Archivo no soportado o muy grande.
- Fallo parcial: sube 2/5 archivos y falla el resto.
- Doble tap en `Save` genera duplicados.
- Error al crear sheet pero media ya subida.

Comportamiento esperado:

- Validacion previa (cantidad, tipo, tamano).
- `Save` idempotente desde UI (lock de submit).
- Manejo transaccional best-effort:
- Si falla guardar fila, informar y ofrecer `Reintentar guardado` sin re-subir media ya subida.
- Borrador local temporal opcional (recomendado) para no perder texto.

---

## 6. TDD (Vitest) - estrategia de implementacion

## 6.1 Regla de trabajo

Para cada historia:

1. Escribir test rojo.
2. Implementar minimo para verde.
3. Refactorizar sin romper tests.

## 6.2 Capas de tests

- Unit tests (70%): utilidades de fecha, naming, validacion, mapeo de API.
- Integration tests ligeros (20%): casos de uso con clientes Drive/Sheets mockeados.
- UI tests de componentes clave (10%): formularios, estados de error, locks de submit.

## 6.3 Primer set de tests (obligatorio antes de features)

- `formatDateSheetName(date) -> YYYY-MM-DD`
- `buildMediaFileName(date, kind, now, entropy)`
- `getWeekRangeMondaySunday(date)`
- `groupMemoriesByDay(memories, weekRange)`
- `validateMemoryInput({title, description, files})`
- `isValidSheetFileName(name)`
- `sortMemoriesPresentToPast(memories)`

## 6.4 Tests de casos limite

- Timezone UTC-12 / UTC+14 para fechas limite.
- Semana que cruza diciembre-enero.
- 0, 1 y 5 archivos.
- Duplicado de submit y reintento.
- URLs vacias/null en columnas `url1..url5`.

---

## 7. Backlog V1 - Sprint 1 (todo el MVP)

## 7.1 Epicas

- E1: Setup de proyecto y UI base.
- E2: Autenticacion y configuracion inicial.
- E3: Persistencia en Drive/Sheets.
- E4: Timeline + filtros + vista semanal.
- E5: Crear recuerdo + carga media.
- E6: Calidad, pruebas y release.

## 7.2 Historias priorizadas

### P0 (bloqueantes)

- `US-01` Login con Google y estado de sesion.
- `US-02` Seleccionar carpeta de Drive y guardar `folderId`.
- `US-03` Crear/obtener Sheet diario por fecha.
- `US-04` Crear recuerdo (fila) con hasta 5 URLs.
- `US-05` Subir media y obtener URLs publicables/consumibles.
- `US-06` Timeline mensual presente->pasado.
- `US-07` Filtro mes/anio en modal movil.
- `US-08` Vista semanal agrupada lunes-domingo.

### P1 (muy recomendadas para cerrar sprint bien)

- `US-09` Manejo robusto de errores y reintentos.
- `US-10` Estado vacio + skeletons + loading states.
- `US-11` Prevencion de duplicados en submit.
- `US-12` Test suite TDD minima + CI.

### P2 (si queda tiempo)

- `US-13` Borrador local para formulario de nuevo recuerdo.
- `US-14` Telemetria basica de errores en consola estructurada.

## 7.3 Criterios de aceptacion transversales (Definition of Done)

- Mobile first (layout estable en 360px de ancho).
- No dependencia de backend propio.
- Todos los flujos criticos con manejo de error.
- Tests unitarios criticos verdes.
- Build de produccion pasa y deploy operativo.

---

## 8. Plan tecnico de repo (para ejecutar rapido)

## 8.1 Estructura sugerida

- `src/app/` (shell, rutas, providers)
- `src/core/auth/`
- `src/core/google/driveClient.js`
- `src/core/google/sheetsClient.js`
- `src/core/domain/dateUtils.js`
- `src/core/domain/namingUtils.js`
- `src/features/setup/`
- `src/features/timeline/`
- `src/features/week/`
- `src/features/memory-create/`
- `src/tests/` (o `*.test.jsx` junto a modulos)

## 8.2 Dependencias

Base UI:

- `tailwindcss`, `postcss`, `autoprefixer`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss-animate`

Testing:

- ya existe `vitest` + `@testing-library/react`

No agregar librerias de estado global por ahora.

---

## 9. Deploy recomendado

## 9.1 GitHub Pages

Si, viable para este MVP.

Checklist:

- Configurar `base` en Vite segun nombre del repo.
- Publicar repo en GitHub (actualmente no hay `remote` configurado).
- Configurar GitHub Actions para build y deploy.
- Configurar OAuth Authorized JavaScript origins para dominio de Pages.

## 9.2 Riesgos de deploy

- Error `invalid_client` por OAuth mal configurado.
- Origen no autorizado (`localhost` vs `github.io`).
- Scope no concedido en prod por cambios de consentimiento.

---

## 10. Mejoras al flujo original (recomendadas)

- Definir una sola fuente de verdad de fechas (`dateUtils`) para evitar bugs de semana/mes.
- Evitar parseo libre de nombres de archivo: regex estricta para `YYYY-MM-DD`.
- No depender de orden de Drive API: ordenar siempre en cliente.
- Usar adaptadores para Google APIs (facil de mockear en tests).
- Implementar estrategia `retry with backoff` para errores 429/5xx.

---

## 11. Propuesta de ejecucion dia a dia (Sprint 1)

- Dia 1: setup Tailwind/shadcn, estructura, tests de utilidades (TDD).
- Dia 2: auth + seleccion carpeta + validaciones permisos.
- Dia 3: sheet diario + crear recuerdo + upload media.
- Dia 4: timeline mensual + filtro mes/anio.
- Dia 5: vista semanal + estados vacios/errores.
- Dia 6: endurecimiento edge cases + accesibilidad basica.
- Dia 7: cierre de tests, deploy GitHub Pages, smoke test final.

Este plan permite entregar el MVP completo en un sprint con riesgo controlado y sin backend.