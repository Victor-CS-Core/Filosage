import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HowItWorks from "@/components/marketing/HowItWorks";
import MarketingFAQ from "@/components/marketing/MarketingFAQ";
import MarketingHero from "@/components/marketing/MarketingHero";

export default function LandingPage() {
  return (
    <div className="marketing-page visitor-home">
      <MarketingHero />
      <HowItWorks />
      <section className="marketing-section visitor-practice" id="features" aria-labelledby="visitor-practice-title">
        <div>
          <h2 id="visitor-practice-title">Practice is part of the lesson.</h2>
          <p>Read an explanation, follow an example, and make your own attempt. Use feedback to see what needs another try.</p>
          <Link className="marketing-text-link" href="/standard">Read the teaching standard <ArrowRight size={15} /></Link>
        </div>
        <dl>
          <div><dt>Work you can revisit</dt><dd>Your notes, practice, and progress stay in your account.</dd></div>
          <div><dt>Sources you can inspect</dt><dd>Lessons distinguish source-backed material from AI general knowledge. A reference alone does not verify a claim.</dd></div>
          <div><dt>Progress that stays honest</dt><dd>Completed practice, assessed work, and unchecked attempts are shown separately.</dd></div>
        </dl>
      </section>
      <MarketingFAQ />
      <section className="marketing-section visitor-next" aria-labelledby="visitor-next-title">
        <div><h2 id="visitor-next-title">See what you could learn.</h2><p>Start with a course outline. Sign up when you’re ready for the lessons.</p></div>
        <Link className="button button-primary" href="/library">Explore courses <ArrowRight size={16} /></Link>
      </section>
    </div>
  );
}
