import Link from "next/link";
import { ArrowDown, ArrowRight, LockKeyhole } from "lucide-react";
import AccountStartButton from "@/components/marketing/AccountStartButton";
import PublicCourseProof from "@/components/marketing/PublicCourseProof";

export default function MarketingHero() {
  return (
    <section className="marketing-hero" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-copy">
        <h1 id="marketing-hero-title">Turn a goal you care about into a course you can practice<b aria-hidden="true">.</b></h1>
        <p className="marketing-hero-lead">Bring a goal or choose a published course, practice the capability in focused stages, and inspect what your learning record actually supports.</p>
        <div className="marketing-hero-actions">
          <Link className="button button-primary" href="/library">Explore course outcomes <ArrowRight size={17} /></Link>
          <AccountStartButton />
        </div>
        <p className="marketing-hero-access"><LockKeyhole size={15} aria-hidden="true" /> Browse complete course outlines first. A free account opens lessons and saves your learning.</p>
        <Link className="marketing-hero-scroll" href="#how-it-works">Follow the learning runway <ArrowDown size={15} /></Link>
      </div>
      <div className="marketing-hero-visual"><PublicCourseProof /></div>
    </section>
  );
}
