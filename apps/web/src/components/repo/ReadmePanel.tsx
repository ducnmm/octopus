import type { BlobView } from "@ducnmm/octopus-shared";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { renderReadmeMarkdown } from "@/lib/markdown.js";

export const ReadmePanel = ({ readme }: { readme: BlobView | null | undefined }) => {
  if (!readme) {
    return null;
  }

  return (
    <Card aria-label="README preview">
      <CardHeader className="flex flex-row items-center gap-2 border-b py-3">
        <BookOpen className="size-4" aria-hidden />
        <span className="text-sm font-semibold">{readme.path}</span>
      </CardHeader>
      <CardContent className="py-4">
        {readme.truncated ? (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Preview is truncated at the configured blob view limit.
          </p>
        ) : null}
        {readme.encoding === "utf8" ? (
          <div
            className="readme-body"
            // Safe: renderReadmeMarkdown escapes all user content during rendering.
            dangerouslySetInnerHTML={{ __html: renderReadmeMarkdown(readme.content) }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">README preview is only available for UTF-8 text.</p>
        )}
      </CardContent>
    </Card>
  );
};
