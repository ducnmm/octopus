import { BrowserRouter, Route, Routes } from "react-router";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { dAppKit } from "./dapp-kit.js";
import { ViewerProvider } from "./hooks/useViewer.js";
import { AppShell } from "./components/layout/AppShell.js";
import { ErrorPanel } from "./components/layout/ErrorPanel.js";
import { AccessSettingsPage } from "./pages/AccessSettingsPage.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { BlobPage } from "./pages/BlobPage.js";
import { CommitsPage } from "./pages/CommitsPage.js";
import { CreateRepoPage } from "./pages/CreateRepoPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { PullCreatePage } from "./pages/PullCreatePage.js";
import { PullDetailPage } from "./pages/PullDetailPage.js";
import { PullListPage } from "./pages/PullListPage.js";
import { RepoPage } from "./pages/RepoPage.js";
import "./styles.css";

const NotFoundPage = () => (
  <AppShell>
    <ErrorPanel error={new Error("Page not found.")} />
  </AppShell>
);

export function App() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <BrowserRouter>
        <ViewerProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/new" element={<CreateRepoPage />} />
            <Route path="/:owner" element={<ProfilePage />} />
            <Route path="/:owner/:repo" element={<RepoPage />} />
            <Route path="/:owner/:repo/tree" element={<RepoPage />} />
            <Route path="/:owner/:repo/blob" element={<BlobPage />} />
            <Route path="/:owner/:repo/commits" element={<CommitsPage />} />
            <Route path="/:owner/:repo/activity" element={<ActivityPage />} />
            <Route path="/:owner/:repo/settings/access" element={<AccessSettingsPage />} />
            <Route path="/:owner/:repo/pulls" element={<PullListPage />} />
            <Route path="/:owner/:repo/pulls/new" element={<PullCreatePage />} />
            <Route path="/:owner/:repo/pulls/:number" element={<PullDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ViewerProvider>
      </BrowserRouter>
    </DAppKitProvider>
  );
}
