import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "@/styles/brand/tokens.css";
import "./globals.css";
import "@/styles/brand/marketing.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { DrawerProvider } from "@/components/AppDrawer";
import TrafficTracker from "@/components/TrafficTracker";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import { serverEnvironment } from "@/lib/runtime-environment";

function safeRequestOrigin(headerList: Headers) {
  const configuredOrigin = serverEnvironment.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall through to the incoming host when a deployment variable is malformed.
    }
  }

  const forwardedHost = headerList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headerList.get("host");
  const forwardedProtocol = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host?.startsWith("localhost")
      ? "http"
      : "https";

  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return `${protocol}://${host}`;
  return "https://teach-app-victo.ktr0nn.chatgpt.site";
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = safeRequestOrigin(await headers());
  const socialImage = new URL("/brand/social/open-graph.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Erudoza · Your daily dose of understanding.",
      template: "%s | Erudoza",
    },
    description: "Learn anything through clear explanations, personalized practice, and guided learning designed to help ideas truly click.",
    applicationName: "Erudoza",
    category: "education",
    alternates: { canonical: "https://erudoza.com" },
    openGraph: {
      title: "Erudoza · Learn anything. Understand everything.",
      description: "Clear explanations, personalized practice, and guided learning for ideas that need to truly click.",
      type: "website",
      url: "https://erudoza.com",
      siteName: "Erudoza",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Erudoza · Learn anything. Understand everything." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Erudoza · Learn anything. Understand everything.",
      description: "Your daily dose of understanding.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#071127" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Theme must be set before first paint. */}
        <script id="erudoza-theme-bootstrap" src="/theme-bootstrap.js" nonce={nonce} suppressHydrationWarning />
        <ThemeProvider>
          <AuthProvider>
            <DrawerProvider>
              <TrafficTracker />
              {children}
              <AnalyticsConsent />
            </DrawerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
