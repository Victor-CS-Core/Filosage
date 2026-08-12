import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import ProductMockup from "@/components/marketing/ProductMockup";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <p className="marketing-tagline">Filosage courses</p>
        <h1 id="marketing-hero-title">Turn curiosity into <span>understanding</span><b aria-hidden="true">.</b></h1>
        <p className="marketing-hero-lead">Study a complex professional skill through clear explanation, applied practice, and evidence you can inspect.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="/library">Start learning <ArrowRight size={17} /></Link>
          <Link className="button button-secondary" href="#how-it-works">See the learning loop <ArrowDown size={16} /></Link>
        </div>
        <ul className="marketing-hero-promises" aria-label="Filosage learning principles">
          <li>Courses tied to a stated outcome</li>
          <li>Source status on every lesson</li>
          <li>Completion kept separate from assessed work</li>
        </ul>
      </div>
      <div className="marketing-hero-visual"><ProductMockup /></div>
    </section>
  );
}
