import { ApiError, apiOrigin, apiUrl } from "./octopus-api.js";

/**
 * The login/unlock panels run a full-page wallet flow and finally redirect to
 * `returnTo` on the server origin (which also serves this SPA in production),
 * so guard redirects are full navigations, not router transitions.
 */
export const loginUrl = (returnToPath: string): string => {
  const params = new URLSearchParams({
    mode: "web",
    server: apiOrigin,
    returnTo: apiUrl(returnToPath),
    autostart: "1"
  });
  return `/login?${params.toString()}`;
};

export const unlockUrl = (owner: string, repo: string, returnToPath: string): string => {
  const params = new URLSearchParams({
    mode: "unlock",
    server: apiOrigin,
    owner,
    repo,
    returnTo: apiUrl(returnToPath),
    autostart: "1"
  });
  return `/login?${params.toString()}`;
};

/**
 * Private-repo guard: translate structured API auth errors into the login or
 * unlock flow. Returns true when a redirect was issued (callers should keep
 * showing their loading state), false when the error is not access-related.
 */
export const redirectForAccessError = (
  error: unknown,
  context: { owner?: string; repo?: string; returnToPath: string }
): boolean => {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.code === "login_required" || error.status === 401) {
    window.location.assign(loginUrl(context.returnToPath));
    return true;
  }

  if ((error.code === "repo_locked" || error.status === 423) && context.owner && context.repo) {
    window.location.assign(unlockUrl(context.owner, context.repo, context.returnToPath));
    return true;
  }

  return false;
};
