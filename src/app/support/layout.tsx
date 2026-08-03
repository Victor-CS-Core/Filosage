import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Erudoza accounts, learning progress, course content, privacy, and future billing.",
  alternates: { canonical: "/support" },
};

export default function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
