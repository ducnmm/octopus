import { browserFlowTarget, type LoginParams } from "../login-params.js";

export const notifyBrowserHost = (
  params: LoginParams,
  type: string,
  data: Record<string, unknown> = {}
): void => {
  const targetOrigin = new URL(params.server || window.location.origin).origin;
  const message = { type, ...data };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, targetOrigin);
  }
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(message, targetOrigin);
  }
};

export const finishBrowserFlow = (params: LoginParams, returnTo: string): void => {
  const target = browserFlowTarget(params, returnTo, window.location.origin);

  if (params.embedded && window.parent && window.parent !== window) {
    notifyBrowserHost(params, "octopus-auth-complete");
    return;
  }

  if (window.opener && !window.opener.closed) {
    notifyBrowserHost(params, "octopus-auth-complete");
    window.setTimeout(() => window.close(), 50);
    window.setTimeout(() => window.location.assign(target), 500);
    return;
  }

  window.location.assign(target);
};
