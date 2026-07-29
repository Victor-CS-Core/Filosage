import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Center",
  robots: { index: false, follow: false },
};

export default function PrivacyCenterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
