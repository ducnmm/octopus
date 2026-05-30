export type LoginParams = {
  mode: string;
  autoStart: boolean;
  embedded: boolean;
  callback: string;
  server: string;
  returnTo: string;
  owner: string;
  ownerWallet: string;
  repo: string;
  repoObjectId: string;
  walletAddress: string;
  role: string;
  action: string;
  delegatePublicKey: string;
  delegateAddress: string;
  state: string;
  packageId: string;
  accountRegistryId: string;
  repoRegistryId: string;
  serverDelegatePublicKey: string;
  serverDelegateAddress: string;
};

export type LoginRuntimeDefaults = Pick<
  LoginParams,
  "server" | "packageId" | "accountRegistryId" | "repoRegistryId"
>;

export type AuthPanelMode = "access" | "cli" | "web" | "unlock";

export const loginParamsFromSearch = (
  search: string,
  defaults: LoginRuntimeDefaults
): LoginParams => {
  const params = new URLSearchParams(search);
  return {
    mode: params.get("mode") ?? "web",
    autoStart: params.get("autostart") === "1",
    embedded: params.get("embed") === "1",
    callback: params.get("callback") ?? "",
    server: params.get("server") ?? defaults.server,
    returnTo: params.get("returnTo") ?? "/",
    owner: params.get("owner") ?? "",
    ownerWallet: params.get("ownerWallet") ?? "",
    repo: params.get("repo") ?? "",
    repoObjectId: params.get("repoObjectId") ?? "",
    walletAddress: params.get("walletAddress") ?? "",
    role: params.get("role") ?? "",
    action: params.get("action") ?? "",
    delegatePublicKey: params.get("delegatePublicKey") ?? "",
    delegateAddress: params.get("delegateAddress") ?? "",
    state: params.get("state") ?? "",
    packageId: params.get("packageId") ?? defaults.packageId,
    accountRegistryId: params.get("accountRegistryId") ?? defaults.accountRegistryId,
    repoRegistryId: params.get("repoRegistryId") ?? defaults.repoRegistryId,
    serverDelegatePublicKey: params.get("serverDelegatePublicKey") ?? "",
    serverDelegateAddress: params.get("serverDelegateAddress") ?? ""
  };
};

export const authPanelMode = (mode: string): AuthPanelMode => {
  if (mode === "access" || mode === "web" || mode === "unlock") {
    return mode;
  }

  return "cli";
};

export const browserFlowTarget = (
  params: Pick<LoginParams, "server">,
  returnTo: string,
  fallbackOrigin: string
): string => {
  const server = params.server || fallbackOrigin;
  const serverOrigin = new URL(server).origin;
  const target = new URL(returnTo || "/", serverOrigin);
  if (target.origin !== serverOrigin) {
    return new URL("/", serverOrigin).toString();
  }

  return target.toString();
};
