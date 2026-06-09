import { describe, expect, it } from "vitest";
import { renderCreateRepoPage, renderLandingPage } from "../src/views/pages.js";

// Snapshot guards for the views layer: these key pages are deterministic and
// catch unintended HTML drift after the web.ts -> views/ decomposition.
describe("views (HTML snapshots)", () => {
  it("renders the landing page", () => {
    expect(renderLandingPage({ loginHref: "/login?mode=web" })).toMatchSnapshot();
  });

  it("renders the create-repo page when signed out", () => {
    expect(renderCreateRepoPage({ loginHref: "/login?mode=web" })).toMatchSnapshot();
  });
});
