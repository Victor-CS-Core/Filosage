import Link from "next/link";
import BrandLogo from "@/components/marketing/BrandLogo";

export default function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-main">
        <BrandLogo />
        <p>Clear explanations, personalized practice, and guided learning for ideas that need to truly click.</p>
        <Link className="marketing-footer-cta" href="/library">Explore the learning library</Link>
      </div>
      <div className="marketing-footer-links">
        <div><strong>Learn</strong><Link href="/library">Explore topics</Link><Link href="/standard">Teaching standard</Link><Link href="/progress">Progress</Link></div>
        <div><strong>Support</strong><Link href="/support">Support</Link><Link href="/privacy-center">Privacy choices</Link><Link href="/copyright">Copyright</Link></div>
        <div><strong>Legal</strong><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/acceptable-use">Acceptable use</Link></div>
      </div>
      <div className="marketing-footer-meta"><span>© {new Date().getFullYear()} Erudoza</span><span>Web learning at erudoza.com</span></div>
    </footer>
  );
}
