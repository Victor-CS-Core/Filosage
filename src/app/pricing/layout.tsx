import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans and Pricing",
  description: "Compare Filosage Free, Plus, and Pro across private course credits, rollover, final-project feedback, progress reports, publishing, and billing intervals.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
