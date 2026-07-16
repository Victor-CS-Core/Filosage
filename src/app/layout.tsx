import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
      default: "Teach - Learn with structure",
      template: "%s | Teach",
    },
    description: "Focused learning paths with clear explanations, visual models, and retrieval practice.",
    applicationName: "Teach",
    category: "education",
    openGraph: {
      title: "Teach - Learn with structure",
      description: "Focused learning paths designed for real understanding.",
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "Teach - Learn with structure. Understand with depth." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Teach - Learn with structure",
      description: "Focused learning paths designed for real understanding.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#17171d" },
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
