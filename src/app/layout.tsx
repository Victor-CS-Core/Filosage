import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";

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
      default: "Erudoza — Your daily dose of understanding",
      template: "%s | Erudoza",
    },
    description: "Clear, focused learning paths with visual models, retrieval practice, and progress that lasts.",
    applicationName: "Erudoza",
    category: "education",
    openGraph: {
      title: "Erudoza — Understand more. Achieve more.",
      description: "Your daily dose of understanding, through focused learning paths built for lasting clarity.",
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "Erudoza — Understand more. Achieve more." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Erudoza — Understand more. Achieve more.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
