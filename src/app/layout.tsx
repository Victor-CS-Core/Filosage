import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
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
  },
  twitter: {
    card: "summary_large_image",
    title: "Teach - Learn with structure",
    description: "Focused learning paths designed for real understanding.",
  },
};

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
