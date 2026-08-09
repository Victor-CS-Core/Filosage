import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans and Pricing",
  description: "Compare Filosage Free and Pro, including lesson access, AI course creation, staged generation, publishing, and monthly limits.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
