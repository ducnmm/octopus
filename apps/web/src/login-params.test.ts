import { describe, expect, it } from "vitest";
import { authPanelMode, browserFlowTarget, loginParamsFromSearch, type LoginRuntimeDefaults } from "./login-params.js";

const defaults: LoginRuntimeDefaults = {
  packageId: "0xpackage",
  accountRegistryId: "0xaccounts",
  repoRegistryId: "0xrepos"
};

describe("login params", () => {
  it("defaults to CLI mode and runtime registry IDs", () => {
    const params = loginParamsFromSearch("", defaults);

    expect(authPanelMode(params.mode)).toBe("cli");
    expect(params.autoStart).toBe(false);
    expect(params.embedded).toBe(false);
    expect(params.returnTo).toBe("/");
    expect(params.packageId).toBe(defaults.packageId);
    expect(params.accountRegistryId).toBe(defaults.accountRegistryId);
    expect(params.repoRegistryId).toBe(defaults.repoRegistryId);
  });

  it("parses web mode with embedded autostart and return target", () => {
    const params = loginParamsFromSearch(
      "?mode=web&server=https%3A%2F%2Foctopus.example&returnTo=%2Fducnmm%2Foctopus%3Ftab%3Dfiles&autostart=1&embed=1",
      defaults
    );

    expect(authPanelMode(params.mode)).toBe("web");
    expect(params.autoStart).toBe(true);
    expect(params.embedded).toBe(true);
    expect(browserFlowTarget(params, params.returnTo, "http://localhost:45173")).toBe(
      "https://octopus.example/ducnmm/octopus?tab=files"
    );
  });

  it("parses unlock mode repository target", () => {
    const params = loginParamsFromSearch(
      "?mode=unlock&server=http%3A%2F%2F127.0.0.1%3A48787&owner=ducnmm&repo=private-demo&returnTo=%2Fducnmm%2Fprivate-demo%2Ftree&autostart=1",
      defaults
    );

    expect(authPanelMode(params.mode)).toBe("unlock");
    expect(params.owner).toBe("ducnmm");
    expect(params.repo).toBe("private-demo");
    expect(browserFlowTarget(params, params.returnTo, "http://localhost:45173")).toBe(
      "http://127.0.0.1:48787/ducnmm/private-demo/tree"
    );
  });

  it("parses access mode contributor target", () => {
    const params = loginParamsFromSearch(
      "?mode=access&server=http%3A%2F%2F127.0.0.1%3A48787&owner=ducnmm.sui&ownerWallet=0xowner&repo=private-demo&repoObjectId=0xrepo&walletAddress=0xabc&role=writer&action=add&returnTo=%2Fducnmm.sui%2Fprivate-demo%2Fsettings%2Faccess&autostart=1",
      defaults
    );

    expect(authPanelMode(params.mode)).toBe("access");
    expect(params.owner).toBe("ducnmm.sui");
    expect(params.ownerWallet).toBe("0xowner");
    expect(params.repo).toBe("private-demo");
    expect(params.repoObjectId).toBe("0xrepo");
    expect(params.walletAddress).toBe("0xabc");
    expect(params.role).toBe("writer");
    expect(params.action).toBe("add");
    expect(browserFlowTarget(params, params.returnTo, "http://localhost:45173")).toBe(
      "http://127.0.0.1:48787/ducnmm.sui/private-demo/settings/access"
    );
  });

  it("falls back from unknown modes and rejects cross-origin returnTo URLs", () => {
    const params = loginParamsFromSearch("?mode=surprise&server=https%3A%2F%2Foctopus.example", defaults);

    expect(authPanelMode(params.mode)).toBe("cli");
    expect(browserFlowTarget(params, "https://evil.example/pwn", "http://localhost:45173")).toBe(
      "https://octopus.example/"
    );
  });
});
