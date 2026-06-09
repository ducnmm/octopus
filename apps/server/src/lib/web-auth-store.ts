import type { RepoUnlockChallenge, WebChallenge } from "./web-session.js";

/**
 * In-memory, single-instance store for short-lived web-session and repo-unlock
 * challenges. Owned by the service container and shared across requests.
 */
export class WebAuthStore {
  readonly webChallenges = new Map<string, WebChallenge>();
  readonly repoUnlockChallenges = new Map<string, RepoUnlockChallenge>();

  cleanup(now: number = Date.now()): void {
    for (const [nonce, challenge] of this.webChallenges) {
      if (challenge.expiresAtMs <= now) {
        this.webChallenges.delete(nonce);
      }
    }
    for (const [nonce, challenge] of this.repoUnlockChallenges) {
      if (challenge.expiresAtMs <= now) {
        this.repoUnlockChallenges.delete(nonce);
      }
    }
  }
}
