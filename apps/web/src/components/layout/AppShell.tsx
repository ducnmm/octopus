import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { LogOut, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.js";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.js";
import { useViewer } from "@/hooks/useViewer.js";
import { loginUrl } from "@/lib/auth-redirect.js";
import { shortWallet } from "@/lib/format.js";

const TopNav = () => {
  const { viewer, logout } = useViewer();
  const location = useLocation();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="Octopus home" className="flex items-center gap-2 font-semibold">
          <img
            src="/android-chrome-192x192.png"
            srcSet="/android-chrome-192x192.png 1x, /android-chrome-512x512.png 2x"
            alt=""
            width={32}
            height={32}
            className="rounded"
          />
          <span>Octopus</span>
        </Link>

        {viewer ? (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/new">
                <Plus className="size-4" aria-hidden />
                New repository
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2" title={viewer.walletAddress}>
                  <Avatar className="size-6">
                    <AvatarFallback>{viewer.walletAddress.slice(2, 4).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-mono text-xs">{shortWallet(viewer.walletAddress)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-mono text-xs">{shortWallet(viewer.walletAddress)}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={`/${encodeURIComponent(viewer.walletAddress)}`}>Your profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button asChild size="sm">
            <a href={loginUrl(location.pathname + location.search)}>
              <Wallet className="size-4" aria-hidden />
              Sign in
            </a>
          </Button>
        )}
      </div>
    </header>
  );
};

const Footer = () => (
  <footer className="border-t py-6 text-center text-sm text-muted-foreground">
    Octopus — recoverable Git on Walrus &amp; Sui
  </footer>
);

export const PageContainer = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
);

export const AppShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <TopNav />
    <PageContainer>{children}</PageContainer>
    <Footer />
  </div>
);
