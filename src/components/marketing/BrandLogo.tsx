import Image from "next/image";
import Link from "next/link";

interface BrandLogoProps {
  compact?: boolean;
  inverse?: boolean;
}

export default function BrandLogo({ compact = false, inverse = false }: BrandLogoProps) {
  return (
    <Link className={`marketing-brand ${inverse ? "is-inverse" : ""}`} href="/" aria-label="Erudoza home">
      <Image src="/brand/logo/erudoza-icon.svg" alt="" width={128} height={128} preload />
      <span>
        <strong>Erudoza</strong>
        {!compact && <small>Your daily dose of understanding.</small>}
      </span>
    </Link>
  );
}
