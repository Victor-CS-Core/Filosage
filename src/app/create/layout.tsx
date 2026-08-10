import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Course Studio",
  description: "Create and review a private AI-assisted course with Filosage Plus or Filosage Pro.",
  robots: { index: false, follow: false },
};

export default function CreateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
