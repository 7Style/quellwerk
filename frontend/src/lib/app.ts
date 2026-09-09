/**
 * Display name and description of the application.
 *
 * NEXT_PUBLIC_APP_NAME and NEXT_PUBLIC_APP_DESCRIPTION are inlined at build
 * time (frontend/Dockerfile build args, compose build.args, frontend/.env.local).
 * The defaults match the compose files (APP_NAME=bp-monolith, no description).
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'bp-monolith';

export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() || '';
