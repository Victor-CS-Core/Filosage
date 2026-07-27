import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "@fontsource-variable/inter";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import TrafficTracker from "@/components/TrafficTracker";

function safeRequestOrigin(headerList: Headers) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
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
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Erudoza · Your daily dose of understanding",
      template: "%s | Erudoza",
    },
    description: "Understanding that lasts: courses held to a published teaching standard, a daily review dose that returns concepts before you forget them, and mastery earned against real criteria.",
    applicationName: "Erudoza",
    category: "education",
    openGraph: {
      title: "Erudoza · Understanding that lasts.",
      description: "Courses held to a teaching standard, daily review before you forget, and mastery you earn.",
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "Erudoza · Understanding that lasts." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Erudoza · Understanding that lasts.",
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
        {/* Browsers hide the nonce attribute from the DOM once CSP reads it,
            so React's hydration check would always see a mismatch here. */}
        <Script id="erudoza-theme-bootstrap" src="/theme-bootstrap.js" strategy="beforeInteractive" nonce={nonce} suppressHydrationWarning />
        <ThemeProvider>
          <AuthProvider>
            <TrafficTracker />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
