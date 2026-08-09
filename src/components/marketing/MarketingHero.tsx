import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import ProductMockup from "@/components/marketing/ProductMockup";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <p className="marketing-tagline">Filosage learning paths</p>
        <h1 id="marketing-hero-title">Turn curiosity into <span>understanding</span><b aria-hidden="true">.</b></h1>
        <p className="marketing-hero-lead">Build a focused path through a complex professional skill, then move from clear explanation to applied practice and evidence you can inspect.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="/library">Start learning <ArrowRight size={17} /></Link>
          <Link className="button button-secondary" href="#how-it-works">See the learning loop <ArrowDown size={16} /></Link>
        </div>
        <ul className="marketing-hero-promises" aria-label="Filosage learning principles">
          <li>Outcome-first learning paths</li>
          <li>Source status on every lesson</li>
          <li>Progress separated by evidence</li>
        </ul>
      </div>
      <div className="marketing-hero-visual"><ProductMockup /></div>
    </section>
  );
}
