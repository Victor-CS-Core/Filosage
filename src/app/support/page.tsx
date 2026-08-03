import { BookOpenCheck, CreditCard, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SUPPORT_CONTACT } from "@/lib/legal";

const supportAreas = [
  {
    icon: UserRound,
    title: "Account and access",
    detail: "Sign-in trouble, paused access, account data requests, or a change you do not recognize.",
    include: "Include the email on the account and the page where the problem happened. Never send a password or authentication code.",
  },
  {
    icon: BookOpenCheck,
    title: "Learning and course content",
    detail: "Missing progress, a lesson that will not unlock, inaccurate material, or a course publication question.",
    include: "Include the course name, lesson title, what you expected, and what happened. Use the in-course report tool for content concerns when available.",
  },
  {
    icon: CreditCard,
    title: "Plans and future billing",
    detail: "Pro checkout is currently closed. No launch-list or pricing-preference action creates a subscription or charge.",
    include: "When paid plans open, receipts, cancellation, payment recovery, and refund questions will use this same support path.",
  },
  {
    icon: ShieldCheck,
    title: "Safety, privacy, and copyright",
    detail: "Report unsafe content, privacy concerns, suspected abuse, or material you believe infringes your rights.",
    include: "Include enough detail to locate the material. Sensitive identity or ownership evidence should only be sent when requested.",
  },
];

export default function SupportPage() {
  const contactHref = `mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent("Erudoza support request")}`;
  return (
    <AppShell>
      <div className="support-page">
        <header className="support-header">
          <p className="overline">Erudoza support</p>
          <h1>Start with the right details.</h1>
          <p>Choose the area that best matches the problem. Clear context helps the owner investigate account records, course state, and operational logs without asking you to repeat the story.</p>
        </header>

        <section className="support-areas" aria-label="Support areas">
          {supportAreas.map(({ icon: Icon, title, detail, include }) => (
            <article key={title}>
              <span><Icon size={19} /></span>
              <div><h2>{title}</h2><p>{detail}</p><small>{include}</small></div>
            </article>
          ))}
        </section>

        <section className="support-contact" aria-labelledby="support-contact-title">
          <Mail size={21} />
          <div><p className="overline">Direct contact</p><h2 id="support-contact-title">Email {SUPPORT_CONTACT}</h2><p>Describe the issue, the affected page or course, when it occurred, and the result you expected. Screenshots are useful when they do not expose private information.</p></div>
          <a className="button button-primary" href={contactHref}>Start an email</a>
        </section>

        <section className="support-protection" aria-labelledby="support-protection-title">
          <LockKeyhole size={20} />
          <div><h2 id="support-protection-title">Commercial launch is still locked</h2><p>Joining the launch list or saving a pricing preference is product research only. Paid checkout remains unavailable until the owner separately activates billing after production operations, customer support, and payment recovery are ready.</p></div>
        </section>
      </div>
    </AppShell>
  );
}
