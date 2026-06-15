import { Code } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.js";
import { CopyButton } from "./CopyButton.js";

export const CloneBox = ({ cloneCommand }: { cloneCommand: string }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm">
        <Code className="size-4" aria-hidden />
        Code
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-96 p-3">
      <h2 className="mb-2 text-sm font-semibold">Clone</h2>
      <p className="mb-1 text-xs text-muted-foreground">HTTPS</p>
      <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1">
        <code className="flex-1 truncate font-mono text-xs" title={cloneCommand}>
          {cloneCommand}
        </code>
        <CopyButton text={cloneCommand} label="Copy clone command" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Run this command in your terminal.</p>
    </DropdownMenuContent>
  </DropdownMenu>
);
