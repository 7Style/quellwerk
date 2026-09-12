import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * Backend origin without the /api suffix (the endpoints carry /api themselves).
 *
 * NEXT_PUBLIC_API_URL is inlined at build time (frontend/Dockerfile build arg,
 * compose build.args). Resolution:
 *   - value set:    used as is
 *   - development:  http://localhost:3011 (the local backend)
 *   - production:   no fallback; an unset value means same-origin ('') and is
 *                   reported once so a misbuilt image is visible immediately
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3011';
  }
  console.error(
    'NEXT_PUBLIC_API_URL is not set: this build sends API requests to its own origin. ' +
      'Pass the backend origin as build arg (docker build --build-arg NEXT_PUBLIC_API_URL=..., ' +
      'compose build.args) and rebuild the frontend image.'
  );
  return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * The one API client, and the one place that knows how a request identifies
 * itself.
 *
 * There is no token. A visitor of Quellwerk is an anonymous session and nothing
 * more (ADR-0005): the backend sets a signed cookie, every route is scoped to
 * it, and there is no account to hold a bearer token for. The template's
 * `Authorization` header read a value from localStorage that nothing in this
 * product ever writes.
 *
 * `credentials: 'include'` is what actually carries the session. The frontend
 * and the backend are different origins (3010 and 3011 locally, and two
 * locations behind one host in production), so without it the browser sends no
 * cookie at all and every request would arrive as a new visitor with an empty
 * notebook. The backend's CORS allowlist is what makes that safe: credentials
 * are only granted to a listed Origin, never to a wildcard.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    credentials: 'include',
    prepareHeaders: (headers, { endpoint }) => {
      // Not for an upload. A multipart body needs the boundary the browser
      // generates, and a Content-Type set here would replace it with one that
      // has no boundary in it, which multer rejects as a malformed body.
      if (!headers.has('Content-Type') && endpoint !== 'uploadSource') {
        headers.set('Content-Type', 'application/json');
      }
      return headers;
    },
  }),
  refetchOnReconnect: true,
  tagTypes: ['Notebook', 'Source', 'Message', 'Report'],
  endpoints: () => ({}),
});
