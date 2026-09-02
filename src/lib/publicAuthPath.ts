/** Public account routes. The PWA install sheet must not cover these forms. */
export const PUBLIC_AUTH_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return (PUBLIC_AUTH_PATHS as readonly string[]).includes(normalized);
}
