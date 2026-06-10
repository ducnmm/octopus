/** Error carrying an HTTP status code, honored by the central error handler. */
export type HttpError = Error & { statusCode: number; code?: string };

/**
 * `code` is a machine-readable error identifier included in the JSON error
 * body so API clients (the web SPA in particular) can branch on the failure
 * kind — e.g. `login_required` vs `repo_locked` — without parsing messages.
 */
export const httpError = (message: string, statusCode: number, code?: string): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
};
