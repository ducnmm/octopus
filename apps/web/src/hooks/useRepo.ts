import { useParams } from "react-router";
import { useApiData, type ApiDataState } from "./useApiData.js";
import { api } from "@/lib/octopus-api.js";
import type { RepoListItem } from "@ducnmm/octopus-shared";

export type RepoData = { repo: RepoListItem; contentUnlocked: boolean };

/** Loads the repo named by the current route params. */
export const useRepo = (): { owner: string; repoName: string; state: ApiDataState<RepoData> } => {
  const { owner = "", repo: repoName = "" } = useParams();
  const state = useApiData(() => api.repo(owner, repoName), [owner, repoName]);
  return { owner, repoName, state };
};
