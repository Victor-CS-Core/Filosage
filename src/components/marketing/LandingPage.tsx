import Link from "next/link";
import { ArrowRight, BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import FeatureGrid from "@/components/marketing/FeatureGrid";
import HowItWorks from "@/components/marketing/HowItWorks";
import MarketingHero from "@/components/marketing/MarketingHero";

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <MarketingHero />
      <FeatureGrid />
      <HowItWorks />
      <section className="marketing-section marketing-access" aria-labelledby="marketing-access-title">
        <div className="marketing-access-copy">
          <h2 id="marketing-access-title">Explore first. Create an account when you are ready to learn.</h2>
          <p>Anyone can inspect published outcomes, modules, lesson titles, and assessment structure. A verified account opens lesson content and keeps your notes, progress, review schedule, and evidence connected.</p>
          <div className="marketing-access-actions">
            <Link className="button button-primary" href="/library">Explore published courses <ArrowRight size={16} /></Link>
            <Link className="button button-secondary" href="/pricing">See plans and availability</Link>
          </div>
        </div>
        <ul className="marketing-access-points" aria-label="Ways to use Filosage">
          <li><BookOpenCheck aria-hidden="true" /><span><strong>Browse before joining</strong><small>Evaluate the full course structure without an account.</small></span></li>
          <li><ShieldCheck aria-hidden="true" /><span><strong>Keep a learning record</strong><small>Save progress, review work, notes, and evidence after sign-in.</small></span></li>
          <li><LockKeyhole aria-hidden="true" /><span><strong>Private creation is controlled</strong><small>Plus and Pro course generation and tutoring remain metered and separately available.</small></span></li>
        </ul>
      </section>
    </div>
  );
}
