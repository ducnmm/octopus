import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ExternalLinkIcon } from "lucide-react";
import { octopusAppUrl } from "./shared";

const navTitle = <span className="octopus-wordmark">Octopus Docs</span>;

const layoutLinks: BaseLayoutProps["links"] = [
  {
    icon: <ExternalLinkIcon />,
    text: "Open App",
    url: octopusAppUrl,
    active: "none",
    secondary: false
  }
];

export function docsLayoutOptions(): BaseLayoutProps {
  return {
    links: layoutLinks,
    nav: {
      title: navTitle
    }
  };
}
