import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Teaching Standard",
  description: "See the safety, language, structure, practice, review, and mastery checks every published Filosage lesson must pass.",
  alternates: { canonical: "/standard" },
};

export default function StandardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
