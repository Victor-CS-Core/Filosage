import FeatureGrid from "@/components/marketing/FeatureGrid";
import FinalCta from "@/components/marketing/FinalCta";
import HowItWorks from "@/components/marketing/HowItWorks";
import MarketingHero from "@/components/marketing/MarketingHero";
import PersonalizedLearningSection from "@/components/marketing/PersonalizedLearningSection";
import ProgressSection from "@/components/marketing/ProgressSection";
import TopicExploration from "@/components/marketing/TopicExploration";

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <MarketingHero />
      <div className="marketing-principles" aria-label="Erudoza value proposition">
        <p>Build real understanding, not just memorization.</p>
        <span aria-hidden="true" />
        <p>Learn at your own pace without losing the thread.</p>
      </div>
      <FeatureGrid />
      <HowItWorks />
      <TopicExploration />
      <PersonalizedLearningSection />
      <ProgressSection />
      <FinalCta />
    </div>
  );
}
