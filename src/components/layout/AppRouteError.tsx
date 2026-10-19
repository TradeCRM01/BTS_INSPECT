import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AppCrashScreen } from './AppCrashScreen';

export function AppRouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? (error.statusText || error.data)
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.';
  return <AppCrashScreen message={typeof message === 'string' ? message : undefined} />;
}
