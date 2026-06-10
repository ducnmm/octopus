// Server-rendered page styles and favicon links, extracted from the views layer.
export const pageStyles = `
      @font-face {
        font-display: swap;
        font-family: Ratch;
        font-style: normal;
        font-weight: 100 900;
        src: url("/assets/ratch.woff2") format("woff2");
      }

      :root {
        color-scheme: light dark;
        --github-header: #24292f;
        --fg-default: #1f2328;
        --fg-muted: #656d76;
        --fg-subtle: #6e7781;
        --canvas-default: #ffffff;
        --canvas-muted: #f6f8fa;
        --canvas-subtle: #f6f8fa;
        --border-default: #d0d7de;
        --border-muted: #d8dee4;
        --accent-fg: #7c3aed;
        --success-fg: #7c3aed;
        --danger-fg: #cf222e;
        --attention-fg: #9a6700;
        --button-hover: #f3f4f6;
        --brand-bg: #7c3aed;
        --brand-hover: #6d28d9;
        --brand-border: rgba(124, 58, 237, 0.42);
        --active-border: #7c3aed;
        --notice-border: #d4a72c66;
        --notice-bg: #fff8c5;
        --folder-fg: #54aeff;
        --folder-bg: #ddf4ff;
        --avatar-bg: #7c3aed;
        --contribution-empty: #ebedf0;
        --contribution-l1: #ede9fe;
        --contribution-l2: #c4b5fd;
        --contribution-l3: #8b5cf6;
        --contribution-l4: #5b21b6;
        --shadow-small: 0 1px 0 rgba(31, 35, 40, 0.04);
        --shadow-overlay: 0 12px 28px rgba(31, 35, 40, 0.16);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --github-header: #010409;
          --fg-default: #e6edf3;
          --fg-muted: #8b949e;
          --fg-subtle: #7d8590;
          --canvas-default: #0d1117;
          --canvas-muted: #161b22;
          --canvas-subtle: #21262d;
          --border-default: #30363d;
          --border-muted: #21262d;
          --accent-fg: #a371f7;
          --success-fg: #a371f7;
          --danger-fg: #ff7b72;
          --attention-fg: #d29922;
          --button-hover: #21262d;
          --brand-bg: #8957e5;
          --brand-hover: #a371f7;
          --brand-border: rgba(163, 113, 247, 0.45);
          --active-border: #a371f7;
          --notice-border: #bb800966;
          --notice-bg: #2d2100;
          --folder-fg: #58a6ff;
          --folder-bg: #0d2d4d;
          --avatar-bg: #8957e5;
          --contribution-empty: #161b22;
          --contribution-l1: #2f1e45;
          --contribution-l2: #56328d;
          --contribution-l3: #8957e5;
          --contribution-l4: #c297ff;
          --shadow-small: 0 0 transparent;
          --shadow-overlay: 0 16px 32px rgba(1, 4, 9, 0.55);
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        min-height: 100vh;
        background: var(--canvas-default);
        color: var(--fg-default);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      .site-topbar {
        background: var(--github-header);
        color: #ffffff;
      }

      .site-topbar-inner {
        display: flex;
        align-items: center;
        min-height: 64px;
        width: min(1280px, calc(100% - 64px));
        margin: 0 auto;
      }

      .site-logo {
        display: block;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        object-fit: contain;
      }

      .site-brand {
        display: inline-flex;
        align-items: center;
        gap: 16px;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        text-decoration: none;
        white-space: nowrap;
      }

      .site-brand:hover {
        color: #c9d1d9;
        text-decoration: none;
      }

      .site-auth {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }

      .site-auth-link,
      .site-auth-button,
      .site-wallet {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px;
        background: transparent;
        color: #ffffff;
        padding: 0 10px;
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
      }

      .site-auth-link:hover,
      .site-auth-button:hover {
        background: rgba(255, 255, 255, 0.08);
        text-decoration: none;
      }

      .site-auth-button {
        cursor: pointer;
        font: inherit;
      }

      .site-auth-form {
        margin: 0;
      }

      .site-wallet {
        max-width: 168px;
        overflow: hidden;
        color: #c9d1d9;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      header {
        border-bottom: 1px solid var(--border-default);
        background: var(--canvas-muted);
      }

      main,
      .bar {
        width: min(1280px, calc(100% - 64px));
        margin: 0 auto;
      }

      .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 98px;
        padding: 22px 0 12px;
      }

      .repo-header-main {
        display: flex;
        width: 100%;
        min-width: 0;
        flex-direction: column;
        gap: 8px;
      }

      h1 {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: var(--fg-default);
        font-size: 20px;
        font-weight: 600;
        line-height: 1.35;
      }

      h1 a,
      h1 a:visited {
        color: var(--accent-fg);
      }

      .repo-title-path {
        display: inline-flex;
        width: 100%;
        min-width: 0;
        align-items: center;
        gap: 6px;
        overflow: hidden;
      }

      .repo-title-owner {
        display: block;
        flex: 0 0 auto;
        color: var(--fg-muted);
        font-weight: 400;
      }

      .repo-title-name {
        display: block;
        min-width: 0;
        overflow: hidden;
        color: var(--accent-fg);
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .repo-subtitle {
        margin: 0;
        color: var(--fg-muted);
        font-size: 13px;
      }

      .repo-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        margin: 2px 0 -13px;
      }

      .repo-nav-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        border-bottom: 2px solid transparent;
        color: var(--fg-default);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
      }

      .repo-nav-link:hover {
        color: var(--fg-default);
        text-decoration: none;
      }

      .repo-nav-link.is-active {
        border-bottom-color: var(--active-border);
        color: var(--fg-default);
      }

      .repo-nav-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: var(--fg-muted);
      }

      .repo-nav-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        border-radius: 999px;
        background: var(--border-muted);
        color: var(--fg-default);
        padding: 0 6px;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
      }

      h2 {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      a {
        color: var(--accent-fg);
        font-weight: 600;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      main {
        padding: 24px 0 48px;
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      .repo-content-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 32px;
        align-items: start;
      }

      .repo-primary {
        display: grid;
        min-width: 0;
        gap: 16px;
      }

      .repo-about {
        display: grid;
        gap: 12px;
        min-width: 0;
      }

      .repo-about h2 {
        margin: 0;
      }

      .repo-about-copy {
        margin: 0;
        color: var(--fg-muted);
        font-size: 14px;
        font-style: italic;
        line-height: 1.5;
      }

      .readme-panel {
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-small);
      }

      .readme-panel-header {
        display: flex;
        align-items: center;
        min-height: 48px;
        border-bottom: 1px solid var(--border-default);
        padding: 0 16px;
      }

      .readme-panel-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 700;
      }

      .readme-body {
        padding: 24px;
        color: var(--fg-default);
        font-size: 16px;
        line-height: 1.55;
      }

      .readme-body > :first-child {
        margin-top: 0;
      }

      .readme-body > :last-child {
        margin-bottom: 0;
      }

      .readme-body h1,
      .readme-body h2,
      .readme-body h3,
      .readme-body h4,
      .readme-body h5,
      .readme-body h6 {
        margin: 24px 0 12px;
        padding-bottom: 0.3em;
        border-bottom: 1px solid var(--border-muted);
        color: var(--fg-default);
        line-height: 1.25;
      }

      .readme-body h1 {
        font-size: 32px;
      }

      .readme-body h2 {
        font-size: 24px;
      }

      .readme-body h3 {
        font-size: 20px;
      }

      .readme-body p,
      .readme-body ul,
      .readme-body ol,
      .readme-body blockquote,
      .readme-body pre {
        margin: 0 0 16px;
      }

      .readme-body ul,
      .readme-body ol {
        padding-left: 2em;
      }

      .readme-body li + li {
        margin-top: 4px;
      }

      .readme-body blockquote {
        border-left: 4px solid var(--border-default);
        color: var(--fg-muted);
        padding: 0 1em;
      }

      .readme-body code {
        display: inline;
        border: 0;
        background: var(--canvas-muted);
        padding: 0.2em 0.4em;
        font-size: 85%;
        white-space: normal;
      }

      .readme-body pre {
        max-height: none;
      }

      .readme-body pre code {
        display: block;
        background: transparent;
        padding: 0;
        white-space: pre;
      }

      .repo-about-list {
        display: grid;
        gap: 10px;
        margin: 0;
        border-top: 1px solid var(--border-muted);
        padding: 14px 0 0;
        list-style: none;
      }

      .repo-about-list li,
      .repo-about-list a {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 9px;
        color: var(--fg-muted);
        font-size: 14px;
        font-weight: 500;
      }

      .repo-about-list strong {
        color: var(--fg-default);
      }

      .repo-about-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: var(--fg-muted);
      }

      .repo-about-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta,
      .branch-chip,
      .branch-trigger,
      .soft-chip,
      .info-trigger,
      .code-trigger {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }

      .meta {
        color: var(--fg-muted);
        font-weight: 500;
      }

      .visibility-meta {
        background: transparent;
      }

      .visibility-meta .badge {
        min-height: auto;
        border: 0;
        background: transparent;
        padding: 0;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .branch-dropdown {
        position: relative;
      }

      .branch-trigger {
        max-width: min(320px, calc(100vw - 48px));
        gap: 7px;
        cursor: pointer;
        list-style: none;
      }

      .branch-trigger::-webkit-details-marker {
        display: none;
      }

      .branch-chip::before {
        content: "";
        width: 12px;
        height: 12px;
        margin-right: 7px;
        border: 1.7px solid currentColor;
        border-radius: 50%;
      }

      .branch-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: var(--fg-muted);
      }

      .branch-trigger-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .branch-trigger::after {
        content: "";
        width: 0;
        height: 0;
        margin-left: 8px;
        border-top: 4px solid currentColor;
        border-right: 4px solid transparent;
        border-left: 4px solid transparent;
        opacity: 0.8;
      }

      .branch-menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 30;
        width: min(360px, calc(100vw - 48px));
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-overlay);
      }

      .branch-menu-heading {
        border-bottom: 1px solid var(--border-muted);
        padding: 10px 12px;
        color: var(--fg-default);
        font-size: 12px;
        font-weight: 600;
      }

      .branch-list {
        display: grid;
        max-height: min(320px, 60vh);
        overflow: auto;
      }

      .branch-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        border-left: 3px solid transparent;
        border-bottom: 1px solid var(--border-muted);
        color: var(--fg-default);
        padding: 9px 12px 9px 9px;
        font-size: 13px;
        font-weight: 500;
      }

      .branch-option:last-child {
        border-bottom: 0;
      }

      .branch-option:hover {
        background: var(--canvas-muted);
        text-decoration: none;
      }

      .branch-option.is-active {
        border-left-color: var(--active-border);
        background: var(--canvas-muted);
      }

      .branch-option-main {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
      }

      .branch-option-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .branch-default,
      .branch-option-sha {
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 500;
      }

      .branch-default {
        border: 1px solid var(--border-default);
        border-radius: 999px;
        padding: 0 6px;
      }

      .repo-stat {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        color: var(--fg-muted);
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }

      .soft-chip {
        color: var(--fg-muted);
      }

      .info-dropdown {
        position: relative;
      }

      .code-dropdown {
        position: relative;
      }

      .info-trigger {
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
        cursor: pointer;
        list-style: none;
      }

      .info-trigger::-webkit-details-marker {
        display: none;
      }

      .code-trigger {
        min-height: 32px;
        gap: 8px;
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
        cursor: pointer;
        list-style: none;
      }

      .code-trigger:hover {
        background: var(--brand-hover);
      }

      .code-trigger::-webkit-details-marker {
        display: none;
      }

      .code-trigger::after {
        content: "";
        width: 0;
        height: 0;
        margin-left: 2px;
        border-top: 4px solid currentColor;
        border-right: 4px solid transparent;
        border-left: 4px solid transparent;
      }

      .code-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .toolbar .notice {
        flex-basis: 100%;
      }

      .table-wrap,
      .repo-list,
      .repo-list-item,
      .panel,
      .summary-panel {
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-small);
      }

      .table-wrap {
        overflow-x: auto;
      }

      .repo-list {
        display: grid;
      }

      .repo-list-item {
        border-width: 0 0 1px;
        border-radius: 0;
        box-shadow: none;
        padding: 20px 24px;
      }

      .repo-list-item:last-child {
        border-bottom: 0;
      }

      .repo-list-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .repo-list-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        margin: 0 0 10px;
        font-size: 20px;
      }

      .repo-list-title a {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .repo-list-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 18px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        font-size: 12px;
        list-style: none;
      }

      .repo-list-meta li {
        min-width: 0;
      }

      .repo-list-meta code {
        max-width: 360px;
      }

      .repo-list-action {
        flex: 0 0 auto;
      }

      .landing-page {
        width: 100%;
        min-height: 100vh;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #000000;
        color: #f7f7f4;
        font-family: Ratch, "Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif;
        font-synthesis: none;
        text-rendering: geometricPrecision;
      }

      .landing-shell {
        position: relative;
        isolation: isolate;
        min-height: 100vh;
        overflow: hidden;
        background: #000000;
      }

      .landing-shell::before {
        position: absolute;
        inset: 0;
        z-index: -1;
        background:
          radial-gradient(circle at 18% 58%, rgba(255, 255, 255, 0.16) 0 1px, transparent 3px),
          radial-gradient(circle at 78% 24%, rgba(255, 255, 255, 0.12) 0 1px, transparent 3px),
          radial-gradient(circle at 95% 52%, rgba(255, 255, 255, 0.2) 0 1px, transparent 4px),
          linear-gradient(180deg, rgba(0, 0, 0, 0.12), #000000 44%, rgba(0, 0, 0, 0));
        content: "";
        pointer-events: none;
      }

      .landing-header {
        position: relative;
        z-index: 3;
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        width: min(calc(100% - 48px), 1436px);
        height: 88px;
        border-bottom: 0;
        margin: 0 auto;
        padding: 16px 0;
        background: transparent;
      }

      .landing-logo {
        width: max-content;
        color: #ffffff;
        font-size: 40px;
        font-weight: 800;
        letter-spacing: 0;
        line-height: 1;
        text-decoration: none;
      }

      .landing-docs span {
        font-size: 20px;
        font-weight: 500;
        line-height: 1;
      }

      .landing-docs {
        justify-self: end;
        display: inline-flex;
        gap: 10px;
        align-items: center;
        min-height: 54px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        padding: 0 30px;
        background: rgba(0, 0, 0, 0.3);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
        color: #ffffff;
        font-size: 18px;
        font-weight: 430;
        letter-spacing: 0.04em;
        text-decoration: none;
      }

      .landing-hero {
        position: relative;
        z-index: 2;
        display: grid;
        justify-items: center;
        width: min(100% - 40px, 1040px);
        margin: 0 auto;
        padding-top: clamp(82px, 8.8vh, 104px);
        text-align: center;
      }

      .landing-title {
        display: grid;
        gap: 0;
        margin: 0;
        color: #f8f8f4;
        font-size: clamp(104px, 10vw, 144px);
        font-weight: 500;
        letter-spacing: 0;
        line-height: 0.8;
      }

      .landing-title span {
        display: block;
      }

      .landing-description {
        width: min(100%, 980px);
        margin: 28px 0 0;
        color: rgba(247, 247, 244, 0.76);
        font-size: clamp(19px, 1.25vw, 24px);
        font-weight: 350;
        letter-spacing: 0;
        line-height: 1.3;
      }

      .landing-description strong {
        color: #ffffff;
        font-weight: 600;
      }

      .landing-actions {
        display: inline-flex;
        margin-top: 34px;
      }

      .landing-connect {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        justify-content: center;
        min-width: 174px;
        min-height: 54px;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 999px;
        padding: 0 30px;
        background: rgba(6, 6, 14, 0.48);
        color: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        font-size: 18px;
        font-weight: 430;
        letter-spacing: 0.04em;
        text-decoration: none;
      }

      .landing-connect:hover,
      .landing-connect:focus-visible {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      .landing-connect span {
        font-size: 18px;
        font-weight: 500;
        line-height: 1;
      }

      .landing-aurora {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 0;
        width: 100%;
        height: min(56vh, 560px);
        object-fit: cover;
        object-position: center top;
        opacity: 0.96;
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.2) 7%, #000000 22%);
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.2) 7%, #000000 22%);
        pointer-events: none;
      }

      .landing-mascot {
        position: absolute;
        bottom: clamp(-345px, -25vw, -210px);
        left: 50%;
        z-index: 1;
        width: clamp(690px, 54vw, 980px);
        max-width: none;
        filter: url("#landing-mascot-defringe");
        transform: translateX(-50%);
        transition: transform 360ms ease;
        pointer-events: auto;
        user-select: none;
        will-change: transform;
      }

      .landing-mascot:hover {
        transform: translateX(-50%) translateY(-46px) scale(1.045);
      }

      .landing-filter-defs {
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
      }

      @media (min-width: 1280px) {
        .landing-header {
          width: calc(100% - 128px);
        }
      }

      @media (max-width: 980px) {
        .landing-header {
          grid-template-columns: 1fr auto;
          width: 100%;
          height: 76px;
          padding: 12px 18px;
        }

        .landing-logo {
          font-size: 36px;
        }

        .landing-docs {
          min-height: 46px;
          padding: 0 20px;
          font-size: 16px;
        }

        .landing-hero {
          width: min(100% - 32px, 760px);
          padding-top: clamp(76px, 10vh, 108px);
        }

        .landing-title {
          font-size: clamp(72px, 12vw, 104px);
          line-height: 0.84;
        }

        .landing-description {
          margin-top: 24px;
          font-size: 20px;
        }

        .landing-actions {
          margin-top: 28px;
        }

        .landing-connect {
          min-width: 152px;
          min-height: 50px;
          font-size: 17px;
        }

        .landing-mascot {
          bottom: clamp(-325px, -38vw, -230px);
          width: clamp(680px, 92vw, 860px);
        }
      }

      @media (max-width: 520px) {
        .landing-header {
          height: 70px;
          padding: 12px 16px;
        }

        .landing-logo {
          font-size: 32px;
        }

        .landing-docs {
          display: none;
        }

        .landing-hero {
          padding-top: 54px;
        }

        .landing-title {
          font-size: clamp(48px, 14vw, 72px);
        }

        .landing-description {
          font-size: 18px;
        }

        .landing-aurora {
          height: 52vh;
        }

        .landing-mascot {
          bottom: -230px;
          width: 670px;
        }

      }

      .dashboard-page {
        width: 100%;
        margin: 0;
        padding: 0;
      }

      .dashboard-layout {
        display: grid;
        min-height: calc(100vh - 64px);
        grid-template-columns: minmax(0, 1fr);
      }

      .dashboard-sidebar {
        border-right: 1px solid var(--border-default);
        background: var(--canvas-muted);
        padding: 24px;
      }

      .dashboard-main {
        width: min(900px, calc(100% - 32px));
        margin: 0 auto;
        padding: 36px 32px 56px;
      }

      .dashboard-aside {
        border-left: 1px solid var(--border-default);
        background: var(--canvas-default);
        padding: 36px 24px;
      }

      .dashboard-user {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 36px;
        color: var(--fg-default);
        font-weight: 600;
      }

      .dashboard-user img,
      .dashboard-feed-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--canvas-default);
      }

      .dashboard-section-title {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 600;
      }

      .dashboard-repo-list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .dashboard-repo-link {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 500;
      }

      .dashboard-repo-link:hover {
        color: var(--accent-fg);
      }

      .dashboard-repo-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .dashboard-repo-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-home-title {
        margin: 0 0 18px;
        font-size: 24px;
        line-height: 1.25;
      }

      .dashboard-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 28px;
      }

      .dashboard-stat-card,
      .dashboard-feed-card,
      .dashboard-side-card {
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-small);
      }

      .dashboard-stat-card {
        display: grid;
        gap: 4px;
        padding: 14px 16px;
      }

      .dashboard-stat-card strong {
        color: var(--fg-default);
        font-size: 20px;
        line-height: 1.2;
      }

      .dashboard-stat-card span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      .dashboard-feed-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }

      .dashboard-feed-header h2 {
        margin: 0;
        font-size: 16px;
      }

      .dashboard-feed {
        display: grid;
        gap: 14px;
      }

      .dashboard-feed-card {
        padding: 16px;
      }

      .dashboard-feed-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        color: var(--fg-muted);
      }

      .dashboard-feed-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
      }

      .dashboard-feed-title strong {
        color: var(--fg-default);
      }

      .dashboard-feed-repo {
        display: grid;
        gap: 10px;
        border-radius: 6px;
        background: var(--canvas-muted);
        padding: 14px;
      }

      .dashboard-feed-repo-head {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .dashboard-feed-repo-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-side-card {
        padding: 16px;
      }

      .dashboard-side-list {
        display: grid;
        gap: 14px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .dashboard-side-list li {
        display: grid;
        gap: 4px;
      }

      .dashboard-side-list span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      .profile-layout {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 32px;
        align-items: start;
      }

      .profile-sidebar {
        display: grid;
        gap: 14px;
      }

      .profile-avatar {
        width: 240px;
        max-width: 100%;
        height: 240px;
        aspect-ratio: 1;
        border: 1px solid var(--border-default);
        border-radius: 50%;
        background: var(--canvas-muted);
        object-fit: contain;
        padding: 44px;
      }

      .profile-name {
        display: block;
        margin: 0;
        color: var(--fg-default);
        font-size: 24px;
        font-weight: 600;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .profile-handle {
        margin: 2px 0 0;
        color: var(--fg-muted);
        font-size: 20px;
        font-weight: 300;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .profile-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        list-style: none;
      }

      .profile-stats strong {
        color: var(--fg-default);
      }

      .profile-main {
        min-width: 0;
      }

      .profile-main-heading {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      .popular-repo-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .popular-repo-card {
        display: grid;
        min-height: 120px;
        align-content: space-between;
        gap: 16px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 16px;
        box-shadow: var(--shadow-small);
      }

      .popular-repo-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .popular-repo-title {
        overflow: hidden;
        color: var(--accent-fg);
        font-size: 16px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .popular-repo-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        font-size: 12px;
        list-style: none;
      }

      .popular-repo-meta li {
        display: inline-flex;
        align-items: center;
      }

      .repo-dot {
        width: 10px;
        height: 10px;
        margin-right: 5px;
        border-radius: 50%;
        background: var(--accent-fg);
      }

      .contribution-section {
        margin-top: 32px;
      }

      .contribution-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }

      .contribution-heading h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 400;
      }

      .contribution-year {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 86px;
        min-height: 32px;
        border-radius: 6px;
        background: var(--brand-bg);
        color: #ffffff;
        padding: 0 14px;
        font-weight: 600;
      }

      .contribution-card {
        overflow-x: auto;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 16px;
        box-shadow: var(--shadow-small);
      }

      .contribution-calendar {
        width: max-content;
        min-width: 100%;
      }

      .contribution-months {
        display: grid;
        grid-auto-columns: 13px;
        grid-auto-flow: column;
        height: 22px;
        margin-left: 40px;
        column-gap: 3px;
      }

      .contribution-month {
        overflow: visible;
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
      }

      .contribution-body {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }

      .contribution-weekdays {
        display: grid;
        width: 32px;
        grid-template-rows: repeat(7, 13px);
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 10px;
      }

      .contribution-weeks {
        display: flex;
        gap: 3px;
      }

      .contribution-week {
        display: grid;
        grid-template-rows: repeat(7, 10px);
        gap: 3px;
      }

      .contribution-day {
        width: 10px;
        height: 10px;
        border: 1px solid rgba(31, 35, 40, 0.06);
        border-radius: 2px;
        background: var(--contribution-empty);
      }

      .contribution-day.is-outside {
        opacity: 0.35;
      }

      .contribution-day.level-1 {
        background: var(--contribution-l1);
      }

      .contribution-day.level-2 {
        background: var(--contribution-l2);
      }

      .contribution-day.level-3 {
        background: var(--contribution-l3);
      }

      .contribution-day.level-4 {
        background: var(--contribution-l4);
      }

      .contribution-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 12px;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .contribution-legend {
        display: inline-flex;
        gap: 3px;
      }

      .activity-section {
        margin-top: 24px;
      }

      .activity-heading {
        margin: 0 0 18px;
        color: var(--fg-default);
        font-size: 20px;
        font-weight: 400;
      }

      .activity-timeline {
        display: grid;
        gap: 26px;
      }

      .activity-month {
        display: grid;
        gap: 14px;
      }

      .activity-month-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 600;
      }

      .activity-month-heading::after {
        content: "";
        height: 1px;
        flex: 1 1 auto;
        background: var(--border-default);
      }

      .activity-group {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 12px;
      }

      .activity-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--border-muted);
        border-radius: 50%;
        background: var(--canvas-muted);
        color: var(--fg-muted);
        font-size: 14px;
        line-height: 1;
      }

      .activity-content {
        min-width: 0;
        padding-top: 2px;
      }

      .activity-title {
        margin: 0 0 8px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 400;
      }

      .activity-list {
        display: grid;
        gap: 7px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .activity-list li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .activity-repo-link {
        overflow: hidden;
        color: var(--accent-fg);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .activity-meta {
        color: var(--fg-muted);
        font-size: 12px;
        white-space: nowrap;
      }

      .activity-bar {
        display: inline-block;
        width: min(156px, calc(var(--activity-scale, 1) * 156px));
        min-width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--contribution-l4);
        vertical-align: middle;
      }

      .repo-activity-panel {
        overflow: hidden;
      }

      .repo-activity-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid var(--border-default);
        padding: 16px;
      }

      .repo-activity-header h2 {
        margin: 0;
      }

      .repo-activity-header p {
        margin: 4px 0 0;
        color: var(--fg-muted);
        font-size: 13px;
      }

      .repo-activity-list {
        display: grid;
      }

      .repo-activity-item {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 12px;
        padding: 16px;
      }

      .repo-activity-item + .repo-activity-item {
        border-top: 1px solid var(--border-muted);
      }

      .repo-activity-kind {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(--border-muted);
        border-radius: 50%;
        background: var(--canvas-muted);
        color: var(--fg-muted);
        font-size: 13px;
        font-weight: 700;
      }

      .repo-activity-main {
        display: grid;
        min-width: 0;
        gap: 6px;
      }

      .repo-activity-title {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: baseline;
        color: var(--fg-default);
        font-weight: 700;
      }

      .repo-activity-title a {
        color: var(--accent-fg);
      }

      .repo-activity-description {
        overflow: hidden;
        margin: 0;
        color: var(--fg-muted);
        font-size: 13px;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .repo-activity-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .repo-activity-proof summary {
        width: max-content;
        cursor: pointer;
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
      }

      .repo-activity-proof[open] summary {
        margin-bottom: 8px;
      }

      .repo-activity-proof-grid {
        display: grid;
        gap: 6px;
      }

      .proof-pill {
        display: grid;
        grid-template-columns: 128px minmax(0, 1fr);
        align-items: baseline;
        max-width: 100%;
        gap: 2px;
        border: 1px solid var(--border-muted);
        border-radius: 6px;
        background: var(--canvas-muted);
        padding: 6px 8px;
        font-size: 12px;
      }

      .proof-label {
        color: var(--fg-muted);
        font-weight: 600;
      }

      .proof-value {
        overflow: hidden;
        color: var(--fg-default);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .github-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        white-space: nowrap;
      }

      .github-button:hover {
        background: var(--button-hover);
        text-decoration: none;
      }

      .github-button.primary {
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
      }

      .github-button.primary:hover {
        background: var(--brand-hover);
      }

      .button-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .panel {
        padding: 16px;
      }

      .private-gate {
        display: grid;
        width: min(560px, 100%);
        gap: 14px;
        margin: 36px auto;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 28px;
        text-align: center;
        box-shadow: var(--shadow-small);
      }

      .private-gate h2 {
        margin: 0;
        font-size: 20px;
      }

      .private-gate p {
        margin: 0;
        color: var(--fg-muted);
      }

      .private-gate-actions {
        display: flex;
        justify-content: center;
      }

      .info-dropdown .summary-panel,
      .code-dropdown .summary-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 20;
        width: min(560px, 50vw);
        min-width: min(420px, calc(100vw - 48px));
        max-height: min(70vh, 560px);
        overflow: auto;
        box-shadow: var(--shadow-overlay);
      }

      .code-dropdown .summary-panel {
        width: min(520px, 70vw);
      }

      .summary-tabs,
      .clone-tabs {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--border-muted);
        padding: 0 12px;
      }

      .summary-tab,
      .clone-tab {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        border-bottom: 2px solid transparent;
        color: var(--fg-muted);
        padding: 0 10px;
        font-size: 13px;
        font-weight: 600;
      }

      .summary-tab.is-active,
      .clone-tab.is-active {
        border-bottom-color: var(--active-border);
        color: var(--fg-default);
      }

      .clone-panel {
        padding: 16px;
      }

      .clone-heading {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      .clone-tabs {
        margin: 0 0 12px;
        padding: 0;
      }

      .clone-command + .clone-command {
        margin-top: 12px;
      }

      .clone-label,
      .summary-label {
        display: block;
        margin: 0 0 6px;
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .clone-url,
      code {
        display: inline-flex;
        max-width: 100%;
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 4px 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .clone-url {
        display: block;
        min-width: 0;
        padding: 8px 10px;
      }

      .clone-url-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 40px;
        gap: 8px;
        align-items: stretch;
      }

      .clone-copy-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        min-width: 40px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--btn-bg);
        color: var(--fg-default);
        cursor: pointer;
      }

      .clone-copy-button:hover,
      .clone-copy-button:focus-visible {
        border-color: var(--accent-fg);
        outline: none;
      }

      .clone-copy-button.is-copied {
        border-color: var(--success-fg);
        color: var(--success-fg);
      }

      .clone-copy-button svg {
        width: 16px;
        height: 16px;
      }

      .access-panel {
        margin-top: 16px;
        border-top: 1px solid var(--border-muted);
        padding-top: 16px;
      }

      .access-page-panel .access-panel {
        margin-top: 0;
        border-top: 0;
        padding-top: 0;
      }

      .access-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 112px auto;
        gap: 8px;
        align-items: center;
      }

      .create-repo-layout {
        display: grid;
        width: min(768px, 100%);
        gap: 16px;
      }

      .create-repo-panel {
        display: grid;
        gap: 18px;
        padding: 24px;
      }

      .create-repo-lead {
        margin: 0;
        color: var(--fg-muted);
      }

      .create-repo-form {
        display: grid;
        gap: 20px;
      }

      .create-repo-name-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        gap: 10px;
        align-items: end;
      }

      .create-repo-divider {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        justify-content: center;
        color: var(--fg-muted);
        font-size: 20px;
        line-height: 1;
      }

      .pull-request-form {
        display: grid;
        gap: 12px;
      }

      .pull-request-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .form-field {
        display: grid;
        gap: 6px;
      }

      fieldset.form-field {
        min-width: 0;
        border: 0;
        margin: 0;
        padding: 0;
      }

      .form-field > label,
      .form-field-label {
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .access-input,
      .access-select,
      .create-repo-input,
      .pull-request-input,
      .pull-request-select,
      .pull-request-textarea {
        min-width: 0;
        min-height: 32px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 0 10px;
        font: inherit;
      }

      .pull-request-textarea {
        min-height: 104px;
        padding: 10px;
        resize: vertical;
      }

      .access-input::placeholder,
      .create-repo-input::placeholder,
      .pull-request-input::placeholder,
      .pull-request-textarea::placeholder {
        color: var(--fg-muted);
      }

      .create-repo-help {
        margin: 2px 0 0;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .visibility-options {
        display: grid;
      }

      .visibility-option {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        align-items: flex-start;
        border-top: 1px solid var(--border-muted);
        padding: 12px 0;
        cursor: pointer;
      }

      .visibility-option:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .visibility-option input {
        margin: 4px 0 0;
      }

      .visibility-title {
        display: block;
        color: var(--fg-default);
        font-weight: 600;
      }

      .visibility-copy {
        display: block;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .create-repo-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        border-top: 1px solid var(--border-muted);
        padding-top: 16px;
      }

      .pull-request-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
      }

      .pull-request-number {
        color: var(--fg-muted);
        font-weight: 500;
      }

      .pull-request-branches,
      .pull-request-body {
        color: var(--fg-muted);
      }

      .pull-request-body {
        white-space: pre-wrap;
      }

      .pull-request-summary {
        align-items: flex-start;
      }

      .pull-request-compare {
        display: inline-flex;
        min-width: 0;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        color: var(--fg-muted);
        font-size: 13px;
      }

      .compare-ref {
        display: inline-flex;
        max-width: min(280px, 100%);
        align-items: center;
        gap: 6px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 600;
      }

      .compare-ref-label {
        color: var(--fg-muted);
        font-weight: 600;
      }

      .compare-ref-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .diff-stat {
        color: var(--fg-muted);
        white-space: nowrap;
      }

      .diff-additions {
        color: var(--success-fg);
      }

      .diff-deletions {
        color: var(--danger-fg);
      }

      .access-list {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .access-empty {
        margin: 12px 0 0;
        color: var(--fg-muted);
      }

      .access-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
        border: 1px solid var(--border-muted);
        border-radius: 6px;
        padding: 8px;
      }

      .access-wallet {
        overflow: hidden;
        color: var(--fg-default);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .access-role {
        color: var(--fg-muted);
        font-size: 12px;
      }

      .github-button.compact {
        min-height: 28px;
        padding: 0 8px;
        font-size: 12px;
      }

      .clone-description,
      .summary-copy {
        margin: 12px 0 0;
        color: var(--fg-muted);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }

      .summary-item {
        min-width: 0;
        border-right: 1px solid var(--border-muted);
        border-bottom: 1px solid var(--border-muted);
        padding: 14px 16px;
      }

      .summary-wide {
        grid-column: span 2;
      }

      .summary-value,
      .summary-list strong,
      .summary-list span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .summary-value {
        color: var(--fg-default);
        font-size: 14px;
      }

      .summary-list {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .summary-list strong {
        color: var(--fg-default);
        font-size: 13px;
      }

      .summary-list span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      table {
        width: 100%;
        min-width: 860px;
        border-collapse: separate;
        border-spacing: 0;
      }

      .compact {
        min-width: 0;
      }

      th,
      td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-muted);
        text-align: left;
        vertical-align: middle;
      }

      th {
        background: var(--canvas-muted);
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      tbody tr:hover {
        background: var(--canvas-muted);
      }

      .repo-link {
        display: inline-block;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
        white-space: nowrap;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 20px;
        border: 1px solid var(--border-default);
        border-radius: 999px;
        background: transparent;
        color: var(--fg-muted);
        padding: 0 7px;
        font-size: 12px;
        font-weight: 500;
        text-transform: capitalize;
      }

      .badge.status-open {
        border-color: var(--success-fg);
        color: var(--success-fg);
      }

      .badge.status-merged {
        border-color: var(--accent-fg);
        color: var(--accent-fg);
      }

      .badge.status-closed {
        border-color: var(--danger-fg);
        color: var(--danger-fg);
      }

      .pull-request-filter {
        display: inline-flex;
        gap: 12px;
      }

      .pull-request-filter a {
        color: var(--fg-muted);
        font-size: 13px;
        text-decoration: none;
      }

      .pull-request-filter a:hover {
        color: var(--fg-default);
      }

      .pull-request-filter a.active {
        color: var(--fg-default);
        font-weight: 600;
      }

      .pull-request-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .pull-request-merge-form {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .pull-request-merge-form label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--fg-muted);
        font-size: 13px;
      }

      .comment-thread {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .comment-item {
        border: 1px solid var(--border-default);
        border-radius: 6px;
      }

      .comment-meta {
        display: flex;
        gap: 8px;
        border-bottom: 1px solid var(--border-default);
        padding: 8px 12px;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .comment-body {
        margin: 0;
        padding: 10px 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .comment-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .empty {
        height: 116px;
        color: var(--fg-muted);
        text-align: center;
        vertical-align: middle;
      }

      .repo-list > .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 160px;
        padding: 24px;
      }

      .notice {
        height: auto;
        border: 1px solid var(--notice-border);
        border-radius: 6px;
        background: var(--notice-bg);
        color: var(--attention-fg);
        margin: 0;
        padding: 10px 12px;
        text-align: left;
      }

      .crumbs,
      .stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
        color: var(--fg-muted);
      }

      .file-browser-table {
        table-layout: fixed;
        min-width: 760px;
      }

      .file-browser-table td {
        text-align: left;
      }

      .file-browser-summary-cell {
        padding: 0;
      }

      .file-browser-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 48px;
        background: var(--canvas-muted);
        padding: 10px 16px;
      }

      .commit-lead,
      .commit-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .commit-lead {
        flex: 1;
      }

      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--avatar-bg);
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

      .commit-author,
      .commit-message,
      .entry-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .commit-author,
      .commit-count {
        color: var(--fg-default);
        font-weight: 600;
      }

      .commit-message,
      .commit-meta,
      .file-message-cell,
      .file-time-cell {
        color: var(--fg-muted);
      }

      .file-name-cell {
        width: 40%;
      }

      .file-time-cell {
        width: 160px;
        text-align: right;
        white-space: nowrap;
      }

      .entry-link {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        gap: 10px;
        color: var(--accent-fg);
        font-weight: 600;
      }

      .entry-icon {
        display: inline-flex;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .entry-icon.folder {
        color: var(--folder-fg);
      }

      .entry-icon.file {
        color: var(--fg-muted);
      }

      pre {
        overflow: auto;
        margin: 0;
        max-height: 72vh;
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      @media (max-width: 860px) {
        main,
        .bar {
          width: calc(100% - 24px);
        }

        .site-topbar-inner {
          width: calc(100% - 24px);
        }

        .repo-list-main {
          flex-direction: column;
        }

        .repo-list-action {
          width: 100%;
        }

        .repo-list-action .github-button {
          width: 100%;
        }

        .profile-layout {
          grid-template-columns: 1fr;
        }

        .profile-sidebar {
          grid-template-columns: 72px minmax(0, 1fr);
          align-items: center;
        }

        .profile-avatar {
          width: 72px;
          height: 72px;
          padding: 14px;
        }

        .profile-stats {
          grid-column: 1 / -1;
        }

        .popular-repo-grid {
          grid-template-columns: 1fr;
        }

        .dashboard-layout {
          grid-template-columns: 1fr;
        }

        .repo-content-layout {
          grid-template-columns: 1fr;
        }

        .dashboard-sidebar,
        .dashboard-aside {
          border: 0;
          border-bottom: 1px solid var(--border-default);
        }

        .dashboard-main {
          padding: 24px 12px 40px;
        }

        .dashboard-summary {
          grid-template-columns: 1fr;
        }

        .contribution-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .contribution-year {
          min-width: 72px;
        }

        .activity-group {
          grid-template-columns: 24px minmax(0, 1fr);
        }

        .activity-icon {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }

        .activity-list li {
          grid-template-columns: 1fr;
          gap: 3px;
        }

        .activity-meta {
          white-space: normal;
        }

        .bar {
          align-items: flex-start;
          flex-direction: column;
          min-height: 0;
        }

        .info-dropdown .summary-panel,
        .code-dropdown .summary-panel {
          position: fixed;
          top: 120px;
          right: 12px;
          left: 12px;
          width: auto;
          min-width: 0;
        }

        .summary-wide {
          grid-column: 1 / -1;
        }

        .file-browser-summary {
          align-items: flex-start;
          flex-direction: column;
        }

        .access-form,
        .access-row,
        .create-repo-name-grid,
        .pull-request-grid {
          grid-template-columns: 1fr;
        }

        .create-repo-divider {
          display: none;
        }

        .access-form .github-button,
        .access-row .github-button {
          width: 100%;
        }

        h1 {
          font-size: 18px;
        }
      }

      @media (max-width: 520px) {
        .site-topbar-inner {
          min-height: 56px;
        }
      }
`;

export const faviconLinks = `
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="theme-color" content="#7c3aed" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#010409" media="(prefers-color-scheme: dark)">`;
