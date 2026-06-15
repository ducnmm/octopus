import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { CopyButton } from "./CopyButton.js";

const CommandBlock = ({ commands }: { commands: string }) => (
  <div className="flex items-start gap-1 rounded-md border bg-muted/50 p-3">
    <pre className="flex-1 overflow-x-auto font-mono text-xs leading-5">
      <code>{commands}</code>
    </pre>
    <CopyButton text={commands} label="Copy commands" />
  </div>
);

/** Shown on empty repositories instead of the file browser. */
export const SetupGuide = ({ remoteUrl }: { remoteUrl: string }) => (
  <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create a new repository on the command line</CardTitle>
      </CardHeader>
      <CardContent>
        <CommandBlock
          commands={`git init\ngit add .\ngit commit -m "first commit"\ngit branch -M main\ngit remote add origin ${remoteUrl}\ngit push -u origin main`}
        />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Push an existing repository from the command line</CardTitle>
      </CardHeader>
      <CardContent>
        <CommandBlock
          commands={`git remote add origin ${remoteUrl}\ngit branch -M main\ngit push -u origin main`}
        />
      </CardContent>
    </Card>
  </div>
);
