import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import ProductMockup from "@/components/marketing/ProductMockup";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <p className="marketing-tagline">Your daily dose of understanding.</p>
        <h1 id="marketing-hero-title">Learn anything.<br /><span>Understand everything.</span></h1>
        <p className="marketing-hero-lead">Explore any topic through clear explanations, personalized practice, and guided learning designed to help ideas truly click.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="/library">Start learning <ArrowRight size={17} /></Link>
          <Link className="button button-secondary" href="#how-it-works">Explore how it works <ArrowDown size={16} /></Link>
        </div>
        <ul className="marketing-hero-promises" aria-label="Erudoza learning principles">
          <li>Clear explanations for complex topics</li>
          <li>Practice that adapts to the learner</li>
          <li>Progress grounded in demonstrated understanding</li>
        </ul>
      </div>
      <div className="marketing-hero-visual"><ProductMockup /></div>
    </section>
  );
}
