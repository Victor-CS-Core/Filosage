import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Capability Cycle and Teaching Standard",
  description: "See how the Filosage Capability Cycle connects focused outcomes, prerequisite recall, practice, feedback, transfer, review, and honest evidence status.",
  alternates: { canonical: "/standard" },
};

export default function StandardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
