import Link from "next/link";
import FilosageMark from "@/components/FilosageMark";

interface BrandLogoProps {
  compact?: boolean;
  inverse?: boolean;
}

export default function BrandLogo({ compact = false, inverse = false }: BrandLogoProps) {
  return (
    <Link className={`marketing-brand ${inverse ? "is-inverse" : ""}`} href="/" aria-label="Filosage home">
      <FilosageMark className={inverse ? "is-inverse" : undefined} />
      <span>
        <strong><span>Filo</span><span>sage</span></strong>
        {!compact && <small>Turn curiosity into understanding<span aria-hidden="true">.</span></small>}
      </span>
    </Link>
  );
}
