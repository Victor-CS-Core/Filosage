import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learning Progress",
  robots: { index: false, follow: false },
};

export default function ProgressLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
