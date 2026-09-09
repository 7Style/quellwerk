# Upload-Modul

Datei-Upload auf die lokale Platte mit multer. Der Speicher steht hinter dem
Interface `IFileStorage` (`interfaces/file-storage.interface.ts`), damit ein
anderer Speicher ohne Änderung an Routen und Controller eingehängt werden
kann. Registriert in `app/modules/index.ts` unter `/api/upload`; die
Authentifizierung ist Pflicht (`requireAuth` aus dem Auth-Modul, kein Fallback).

## Endpunkte

Alle Routen nur mit `Authorization: Bearer <accessToken>`.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/upload/single` | Feld `file`; optional `folder` (nur `A-Z a-z 0-9 _ -`, max. 64 Zeichen) |
| POST | `/api/upload/multiple` | Feld `files`, max. 10 Dateien |
| GET | `/api/upload/:fileId` | Datei inline; Content-Type aus den Magic Bytes, `X-Content-Type-Options: nosniff` |
| DELETE | `/api/upload/:fileId` | Datei löschen |

Antwort beim Upload: `{ id, filename, originalName, mimetype, size, url, uploadedAt }`.
`id` ist der gespeicherte Dateiname, `url` = `BASE_URL` (Fallback `API_URL`) +
`/api/upload/<id>`.

## Prüfungen

1. multer `fileFilter` (`configs/multer.config.ts`): Content-Type und Endung gegen
   die Allowlist in `types/file-types.ts` und `utils/file-validation.util.ts`:
   `jpg`, `jpeg`, `png`, `gif`, `webp`, `pdf`, `docx`, `xlsx`. Archive und
   Makro-Formate (`.zip`, `.doc`, `.xls`) sind bewusst nicht erlaubt.
2. Magic-Byte-Prüfung nach dem Schreiben (`routes/upload.routes.ts`,
   `verifyUploadedFiles` mit `file-type`): passt der Inhalt zu keinem erlaubten
   Typ, wird die Datei wieder gelöscht und die Anfrage mit 400 abgelehnt.
3. Dateinamen: `crypto.randomUUID()` plus Endung aus der Allowlist
   (`generateUniqueFilename`); der Originalname steht nur in der Antwort.
   `folder` wird bereinigt und gegen Directory Traversal geprüft (`isInside`),
   Lesen und Löschen ebenso (`safePath`).
4. multer-`limits`: `fileSize` 5 MB, `files` 10, `fields` 10, `parts` 20,
   `fieldNameSize` 100, `fieldSize` 10 KB.
5. Rate-Limit `upload` aus `config/rate-limit.config.ts`: 10 Uploads je
   10 Minuten und IP/Nutzer.

## Konfiguration

| Variable | Wirkung |
|---|---|
| `UPLOAD_DIR` | Zielverzeichnis (Default `uploads`); im Container `/usr/src/app/uploads`, dort hängt das Volume `backend_uploads` |
| `BASE_URL`, `API_URL` | Basis der `url` in der Antwort |

`UPLOAD_MAX_FILE_SIZE` und `UPLOAD_ALLOWED_TYPES` werden in `env.config.ts`
validiert, vom Modul aber nicht gelesen: Limits und Allowlist stehen fest in
`types/file-types.ts` (`FILE_UPLOAD_CONFIG`, `ALLOWED_FILE_TYPES`).

## Offen

Metadaten werden nicht gespeichert, es gibt keine Besitzprüfung: jeder
authentifizierte Nutzer kann jede Datei per UUID lesen oder löschen. Für
Eigentümer-Prüfungen ein `File`-Modell in `prisma/schema.prisma` anlegen und
`UploadService.deleteFile` ergänzen (TODO im Code).
