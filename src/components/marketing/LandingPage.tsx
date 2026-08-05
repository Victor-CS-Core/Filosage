import FeatureGrid from "@/components/marketing/FeatureGrid";
import HowItWorks from "@/components/marketing/HowItWorks";
import MarketingHero from "@/components/marketing/MarketingHero";

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <MarketingHero />
      <FeatureGrid />
      <HowItWorks />
    </div>
  );
}
