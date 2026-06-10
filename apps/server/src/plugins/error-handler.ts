import fp from "fastify-plugin";
import { redactDelegateSecrets } from "../auth.js";

/**
 * Central error handler: derives the status code, redacts delegate secrets from
 * any leaked message/stack, and logs 5xx failures.
 */
export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler(async (error, request, reply) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      const statusCode =
        typeof (nextError as Error & { statusCode?: unknown }).statusCode === "number"
          ? (nextError as Error & { statusCode: number }).statusCode
          : 500;
      const message = redactDelegateSecrets(nextError.message);
      if (statusCode >= 500) {
        request.log.error(
          {
            statusCode,
            method: request.method,
            url: request.url,
            error: message,
            stack: nextError.stack ? redactDelegateSecrets(nextError.stack) : undefined
          },
          "request failed"
        );
      }
      const code = (nextError as Error & { code?: unknown }).code;
      await reply.code(statusCode).send(typeof code === "string" ? { error: message, code } : { error: message });
    });
  },
  { name: "octopus-error-handler" }
);

export default errorHandlerPlugin;
