import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Course Studio",
  description: "Create a private AI-assisted course organized by the Filosage Capability Cycle with Filosage Plus or Filosage Pro.",
  robots: { index: false, follow: false },
};

export default function CreateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
