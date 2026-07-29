import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner Control Room",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
