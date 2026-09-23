import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthNavbar, ExperienceBrand } from "@/components/AuthNavbar";
import { SessionBootstrap } from "@/components/session-bootstrap";
import { PlatformChrome } from "@/components/sih/SihShell";
import { I18nProvider } from "@/i18n";
import { AarambhIntro } from "@/components/AarambhIntro";

export const metadata: Metadata = {
  title: "AARAMBH",
  description: "AI-enabled competency intelligence and personalized learning for India's statistical workforce."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <I18nProvider>
          <SessionBootstrap />
          <header className="global-header">
            <nav className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-y-2 px-4 py-2 sm:px-6">
              <ExperienceBrand />
              <AuthNavbar />
            </nav>
          </header>
          <main>
            <PlatformChrome>{children}</PlatformChrome>
          </main>
          <AarambhIntro />
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
