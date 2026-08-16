import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Course Library",
  description: "Browse published learning goals, inspect complete course outlines, and create a free account to open lessons and practice.",
  alternates: { canonical: "/library" },
};

export default function LibraryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
