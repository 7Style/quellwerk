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

const API_BASE_URL = resolveApiBaseUrl();

/**
 * Get access token from localStorage
 */
function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('accessToken');
}

/**
 * Base API configuration for RTK Query
 * All module-specific APIs should inject endpoints into this base API
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    prepareHeaders: (headers) => {
      // Always read fresh token from localStorage
      const token = getAccessToken();

      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      headers.set('Content-Type', 'application/json');
      return headers;
    },
  }),
  // Refetch on reconnect and focus
  refetchOnReconnect: true,
  tagTypes: ['User', 'Role', 'Metadata', 'Project'],
  endpoints: () => ({}),
});
