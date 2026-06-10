import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { ApiError } from "@/lib/octopus-api.js";

export const ErrorPanel = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const message =
    error instanceof ApiError
      ? error.status === 404
        ? "Not found."
        : error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong.";

  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" aria-hidden />
      <AlertTitle>Could not load this page</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{message}</span>
        {onRetry ? (
          <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};
