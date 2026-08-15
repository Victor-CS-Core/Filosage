import Link from "next/link";
import { ArrowRight, BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import AccountStartButton from "@/components/marketing/AccountStartButton";
import EvidenceDossier from "@/components/marketing/EvidenceDossier";
import FeatureGrid from "@/components/marketing/FeatureGrid";
import HowItWorks from "@/components/marketing/HowItWorks";
import MarketingFAQ from "@/components/marketing/MarketingFAQ";
import MarketingHero from "@/components/marketing/MarketingHero";

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <MarketingHero />
      <HowItWorks />
      <FeatureGrid />
      <EvidenceDossier />
      <section className="marketing-section marketing-trust" aria-labelledby="marketing-trust-title">
        <div><h2 id="marketing-trust-title">Trust is a visible state, not a marketing badge.</h2><p>Published courses disclose their structure and source status. Generated lessons pass safety, language, structure, and teaching-quality checks, while legacy or unverified material keeps its caveats.</p><Link className="marketing-text-link" href="/standard">See the complete teaching standard <ArrowRight size={15} /></Link></div>
        <ul><li><ShieldCheck aria-hidden="true" /><span><strong>Source status stays specific</strong><small>A link is not presented as proof that its page supported a lesson claim.</small></span></li><li><BookOpenCheck aria-hidden="true" /><span><strong>Course structure stays public</strong><small>Inspect outcomes, modules, lesson titles, and assessment shape before joining.</small></span></li><li><LockKeyhole aria-hidden="true" /><span><strong>Learning work stays account-bound</strong><small>Lesson bodies, notes, progress, tools, and evidence require a verified learner.</small></span></li></ul>
      </section>
      <MarketingFAQ />
      <section className="marketing-section marketing-access" aria-labelledby="marketing-access-title">
        <div className="marketing-access-copy">
          <h2 id="marketing-access-title">Inspect the path. Join when it fits the work.</h2>
          <p>Anyone can inspect published outcomes, modules, lesson titles, and assessment structure. A verified account opens lesson content and keeps your notes, progress, review schedule, and evidence connected.</p>
          <div className="marketing-access-actions">
            <Link className="button button-primary" href="/library">Explore published courses <ArrowRight size={16} /></Link>
            <AccountStartButton />
            <Link className="button button-quiet" href="/pricing">See plans and availability</Link>
          </div>
        </div>
        <ul className="marketing-access-points" aria-label="Ways to use Filosage">
          <li><BookOpenCheck aria-hidden="true" /><span><strong>Browse before joining</strong><small>Evaluate the full course structure without an account.</small></span></li>
          <li><ShieldCheck aria-hidden="true" /><span><strong>Keep a learning record</strong><small>Save progress, review work, notes, and evidence after sign-in.</small></span></li>
          <li><LockKeyhole aria-hidden="true" /><span><strong>Paid availability stays explicit</strong><small>The plans page shows current access and whether paid checkout is open.</small></span></li>
        </ul>
      </section>
    </div>
  );
}
