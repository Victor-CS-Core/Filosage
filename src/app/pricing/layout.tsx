import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans and Pricing",
  description: "Compare Filosage Free, Plus, and Pro, including learning access, private course creation, AI allowances, publishing, and billing intervals.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
