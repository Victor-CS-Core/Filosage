import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import PublicCourseProof from "@/components/marketing/PublicCourseProof";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <h1 id="marketing-hero-title">Learn it well enough to use it<b aria-hidden="true">.</b></h1>
        <p className="marketing-hero-lead">Choose a published course or bring your own goal. Filosage takes you through short lessons, hands-on practice, timely review, and a final piece of work you can inspect.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="#featured-course">View the featured course <ArrowRight size={17} /></Link>
          <Link className="button button-secondary" href="/library">Browse all courses</Link>
        </div>
        <p className="marketing-hero-access"><LockKeyhole size={15} aria-hidden="true" /> Every course outline is public. Sign up when you want to open lessons and save your work.</p>
      </div>
      <div className="marketing-hero-visual"><PublicCourseProof /></div>
    </section>
  );
}
