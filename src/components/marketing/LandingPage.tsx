import Link from "next/link";
import { ArrowRight, BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
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
        <div><h2 id="marketing-trust-title">Know where the material comes from.</h2><p>Course pages show whether a lesson uses verified sources, AI general knowledge, or further reading. They also show the course structure before you create an account.</p><Link className="marketing-text-link" href="/standard">Read the teaching and source standard <ArrowRight size={15} /></Link></div>
        <ul><li><ShieldCheck aria-hidden="true" /><span><strong>Sources are labeled</strong><small>Verified sources are kept separate from AI general knowledge and reading suggestions.</small></span></li><li><BookOpenCheck aria-hidden="true" /><span><strong>The outline is public</strong><small>Review the outcome, modules, lesson titles, and assessment before joining.</small></span></li><li><LockKeyhole aria-hidden="true" /><span><strong>Your learning stays with your account</strong><small>Lesson access, notes, progress, study tools, and evidence require a verified learner.</small></span></li></ul>
      </section>
      <MarketingFAQ />
      <section className="marketing-section marketing-access" aria-labelledby="marketing-access-title">
        <div className="marketing-access-copy">
          <h2 id="marketing-access-title">Find a course that fits.</h2>
          <p>Browse by topic, level, or time. Open any course outline before deciding whether to sign up.</p>
          <div className="marketing-access-actions">
            <Link className="button button-primary" href="/library">Browse published courses <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
