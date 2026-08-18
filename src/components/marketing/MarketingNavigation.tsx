"use client";

import Link from "next/link";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
import { useRef, useState } from "react";
import BrandLogo from "@/components/marketing/BrandLogo";
import EnvironmentPill from "@/components/EnvironmentPill";

interface MarketingNavigationProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignIn: (returnFocus: HTMLElement) => void;
}

const links = [
  { href: "/#features", label: "Why Filosage" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/library", label: "Explore topics" },
  { href: "/standard", label: "Trust and quality" },
];

export default function MarketingNavigation({ theme, onToggleTheme, onSignIn }: MarketingNavigationProps) {
  const [open, setOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="marketing-nav-shell">
      <BrandLogo />
      <nav className="marketing-nav-links" aria-label="Public navigation">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="marketing-nav-actions">
        <EnvironmentPill />
        <button className="icon-button" type="button" onClick={onToggleTheme} aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`} title={`Use ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="button button-quiet marketing-sign-in" type="button" onClick={(event) => onSignIn(event.currentTarget)}>Sign in</button>
        <Link className="button button-primary marketing-start" href="/library">Explore courses <ArrowRight size={16} /></Link>
        <button ref={menuTriggerRef} className="icon-button marketing-menu-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="marketing-mobile-menu" aria-label={`${open ? "Close" : "Open"} navigation menu`}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      <div className={`marketing-mobile-menu ${open ? "is-open" : ""}`} id="marketing-mobile-menu">
        <nav aria-label="Mobile public navigation">
          {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
          <button type="button" onClick={(event) => { setOpen(false); onSignIn(menuTriggerRef.current ?? event.currentTarget); }}>Sign in</button>
          <Link className="button button-primary" href="/library" onClick={() => setOpen(false)}>Explore courses <ArrowRight size={16} /></Link>
        </nav>
      </div>
    </header>
  );
}
