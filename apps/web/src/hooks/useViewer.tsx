import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WebViewer } from "@ducnmm/octopus-shared";
import { api } from "../lib/octopus-api.js";

export type ViewerState = {
  /** True until the first web-session check resolves. */
  loading: boolean;
  viewer: WebViewer;
  accountId: string | null;
  unlockedRepoIds: ReadonlySet<string>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const ViewerContext = createContext<ViewerState | null>(null);

export const ViewerProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<WebViewer>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [unlockedRepoIds, setUnlockedRepoIds] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const session = await api.webSession();
      if (session.authenticated) {
        setViewer({ walletAddress: session.walletAddress });
        setAccountId(session.accountId);
        setUnlockedRepoIds(new Set(session.unlockedRepoIds));
      } else {
        setViewer(null);
        setAccountId(null);
        setUnlockedRepoIds(new Set());
      }
    } catch {
      // Treat an unreachable session endpoint as signed out.
      setViewer(null);
      setAccountId(null);
      setUnlockedRepoIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ loading, viewer, accountId, unlockedRepoIds, refresh, logout }),
    [loading, viewer, accountId, unlockedRepoIds, refresh, logout]
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
};

export const useViewer = (): ViewerState => {
  const state = useContext(ViewerContext);
  if (!state) {
    throw new Error("useViewer must be used within a ViewerProvider");
  }
  return state;
};
