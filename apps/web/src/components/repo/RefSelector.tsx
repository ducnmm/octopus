import type { RepoListItem, RepoRefListItem } from "@ducnmm/octopus-shared";
import { useNavigate } from "react-router";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.js";
import { Badge } from "@/components/ui/badge.js";
import { repoBasePath, shortCommit, shortRef } from "@/lib/format.js";
import { hrefWithQuery, sameRef } from "@/lib/repo-utils.js";

export type RefSelectorTarget = { view: "tree" | "commits" | "blob"; path?: string };

const branchTargetHref = (repo: RepoListItem, branch: RepoRefListItem, target: RefSelectorTarget): string => {
  const ref = branch.shortName;
  if (target.view === "commits") {
    return hrefWithQuery(`${repoBasePath(repo)}/commits`, { ref });
  }
  if (target.view === "blob") {
    return hrefWithQuery(`${repoBasePath(repo)}/blob`, { ref, path: target.path });
  }
  return hrefWithQuery(`${repoBasePath(repo)}/tree`, { ref, path: target.path });
};

export const RefSelector = ({ repo, refName, target }: { repo: RepoListItem; refName: string; target: RefSelectorTarget }) => {
  const navigate = useNavigate();
  const currentShortRef = shortRef(refName);
  const branches: RepoRefListItem[] =
    repo.refs.length > 0
      ? repo.refs
      : [
          {
            name: repo.defaultBranch,
            shortName: shortRef(repo.defaultBranch),
            commitDigest: repo.defaultBranchCommit ?? "",
            updatedAtMs: repo.updatedAtMs,
            isDefault: true
          }
        ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="size-4" aria-hidden />
          <span className="max-w-40 truncate">{currentShortRef}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Switch branches</DropdownMenuLabel>
        {branches.map((branch) => {
          const isActive = sameRef(branch.name, currentShortRef) || branch.shortName === currentShortRef;
          return (
            <DropdownMenuItem
              key={branch.name}
              className={isActive ? "bg-accent" : undefined}
              onSelect={() => navigate(branchTargetHref(repo, branch, target))}
            >
              <span className="flex flex-1 items-center gap-2 truncate">
                <span className="truncate">{branch.shortName}</span>
                {branch.isDefault ? <Badge variant="secondary">default</Badge> : null}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{shortCommit(branch.commitDigest)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
