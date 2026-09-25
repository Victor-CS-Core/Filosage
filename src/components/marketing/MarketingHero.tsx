import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import PublicCourseProof from "@/components/marketing/PublicCourseProof";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <h1 id="marketing-hero-title">Learn something you can use<b aria-hidden="true">.</b></h1>
        <p className="marketing-hero-lead">FiloSage builds a complete course around your goal — clear explanations, guided practice, and a real project at the end. Start free with the public library.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="/library">Explore courses <ArrowRight size={17} /></Link>
          <Link className="marketing-text-link" href="#how-it-works">How it works <ArrowRight size={15} /></Link>
        </div>
        <p className="marketing-hero-access"><LockKeyhole size={15} aria-hidden="true" /> Browse the outlines. Create a free account to take a course.</p>
      </div>
      <div className="marketing-hero-visual"><PublicCourseProof /></div>
    </section>
  );
}
