import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support and documentation",
  description: "Find current Filosage guides for courses, lessons, reviews, progress, accounts, privacy, accessibility, and support.",
  alternates: { canonical: "/support" },
};

export default function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
