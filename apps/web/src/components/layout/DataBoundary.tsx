import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { redirectForAccessError } from "@/lib/auth-redirect.js";
import { ErrorPanel } from "./ErrorPanel.js";
import { Loading } from "./Loading.js";

/**
 * Wraps page content in loading/error handling. Access errors (login needed /
 * unlock needed) trigger the wallet flow redirect instead of an error panel.
 */
export const DataBoundary = ({
  loading,
  error,
  owner,
  repo,
  onRetry,
  children
}: {
  loading: boolean;
  error: unknown;
  owner?: string;
  repo?: string;
  onRetry?: () => void;
  children: ReactNode;
}) => {
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (error && redirectForAccessError(error, { owner, repo, returnToPath: location.pathname + location.search })) {
      setRedirecting(true);
    }
  }, [error, owner, repo, location.pathname, location.search]);

  if (loading || redirecting) {
    return <Loading />;
  }
  if (error) {
    return <ErrorPanel error={error} onRetry={onRetry} />;
  }
  return <>{children}</>;
};
