import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evidence Example",
  description: "Inspect fictional demonstration data showing how Filosage distinguishes self-report, observed practice, assessed criteria, and unresolved evidence.",
  alternates: { canonical: "/evidence-example" },
};

export default function EvidenceExampleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
