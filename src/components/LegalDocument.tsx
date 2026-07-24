import Link from "next/link";
import AppShell from "@/components/AppShell";
import { LEGAL_CONTACT, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export default function LegalDocument({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return <AppShell><article className="legal-page">
    <header><p className="overline">{eyebrow}</p><h1>{title}</h1><p>{summary}</p><dl><div><dt>Effective</dt><dd>{LEGAL_EFFECTIVE_DATE}</dd></div><div><dt>Contact</dt><dd><a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></dd></div></dl></header>
    <nav className="legal-local-nav" aria-label="Legal documents"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/acceptable-use">Acceptable use</Link><Link href="/copyright">Copyright</Link><Link href="/privacy-center">Privacy choices</Link></nav>
    <div className="legal-content">{children}</div>
    <footer><p>Questions about these documents can be sent to <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.</p></footer>
  </article></AppShell>;
}
