import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learning Evidence",
  robots: { index: false, follow: false },
};

export default function EvidenceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
