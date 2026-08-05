import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BrandLogo from "@/components/marketing/BrandLogo";

export default function FinalCta() {
  return (
    <section className="marketing-final-cta" aria-labelledby="final-cta-title">
      <BrandLogo inverse compact />
      <div><h2 id="final-cta-title">What would you like to understand next?</h2><p>Explore a topic, inspect the learning path, and begin when the route feels useful.</p></div>
      <Link className="button marketing-inverse-button" href="/library">Start learning <ArrowRight size={17} /></Link>
    </section>
  );
}
