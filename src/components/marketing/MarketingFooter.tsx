import Link from "next/link";
import BrandLogo from "@/components/marketing/BrandLogo";

export default function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-main">
        <BrandLogo />
        <p>Short lessons and guided practice, built around a real outcome.</p>
        <Link className="marketing-footer-cta" href="/library">Explore the learning library</Link>
      </div>
      <div className="marketing-footer-links">
        <div><strong>Learn</strong><Link href="/library">Explore courses</Link><Link href="/standard">Teaching standard</Link><Link href="/pricing">Plans</Link></div>
        <div><strong>Support</strong><Link href="/support">Support</Link><Link href="/privacy-center">Privacy choices</Link><Link href="/copyright">Copyright</Link></div>
        <div><strong>Legal</strong><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/acceptable-use">Acceptable use</Link></div>
      </div>
      <div className="marketing-footer-meta"><span>© {new Date().getFullYear()} Filosage</span><span>filosage.com</span></div>
    </footer>
  );
}
