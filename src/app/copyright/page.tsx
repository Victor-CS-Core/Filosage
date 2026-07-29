import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { LEGAL_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description: "How Erudoza handles copyright concerns and repeat infringement.",
};

export default function CopyrightPage() {
  return <LegalDocument eyebrow="Copyright" title="Copyright Policy" summary="Erudoza respects intellectual-property rights and responds to specific, good-faith reports about material available through the service.">
    <section><h2>Reporting claimed infringement</h2><p>Send a written notice to <a href={`mailto:${LEGAL_CONTACT}?subject=Copyright%20notice`}>{LEGAL_CONTACT}</a>. Include: your physical or electronic signature; identification of the copyrighted work; the exact URL or other information sufficient to locate the material; your name, mailing address, telephone number, and email address; a statement that you have a good-faith belief the disputed use is not authorized by the copyright owner, its agent, or law; and a statement, under penalty of perjury, that the notice is accurate and you are authorized to act for the owner.</p></section>
    <section><h2>What happens after a report</h2><p>Erudoza may request missing information, restrict access while reviewing a report, remove or disable material, notify the affected creator, preserve relevant records, and take other appropriate action. Knowingly making a material misrepresentation in a copyright notice may create liability.</p></section>
    <section><h2>Counter-notices</h2><p>If your material was removed because of a copyright report and you believe that happened through mistake or misidentification, email <a href={`mailto:${LEGAL_CONTACT}?subject=Copyright%20counter-notice`}>{LEGAL_CONTACT}</a>. A legally sufficient counter-notice generally must identify the removed material and its former location, include your signature and contact information, state under penalty of perjury that you have a good-faith belief removal resulted from mistake or misidentification, and include the jurisdiction and service-of-process statements required by applicable law. We may forward a counter-notice to the original complainant.</p></section>
    <section><h2>Repeat infringement</h2><p>Erudoza may suspend or terminate accounts that repeatedly or seriously infringe intellectual-property rights, taking account of valid notices, counter-notices, retractions, surrounding facts, and applicable law. Users may not evade an enforcement action by opening another account.</p></section>
    <section><h2>Copyright contact</h2><p>The email above is Erudoza&apos;s operational copyright contact. A DMCA safe-harbor agent designation is a separate filing with the U.S. Copyright Office and must identify the service&apos;s legal operator and required public contact details.</p></section>
  </LegalDocument>;
}
