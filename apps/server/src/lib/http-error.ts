/** Error carrying an HTTP status code, honored by the central error handler. */
export type HttpError = Error & { statusCode: number };

export const httpError = (message: string, statusCode: number): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};
