"use client";

import {
  BookOpenCheck,
  BrainCircuit,
  CalendarCheck2,
  Check,
  Clock3,
  Compass,
  DraftingCompass,
  Flame,
  Orbit,
  Repeat2,
  Send,
  Sparkles,
  Target,
  Trophy,
  Layers3,
  type LucideIcon,
} from "lucide-react";
import type { BadgeIcon, EvaluatedBadge } from "@/lib/badges";

const icons: Record<BadgeIcon, LucideIcon> = {
  book: BookOpenCheck,
  compass: Compass,
  flame: Flame,
  calendar: CalendarCheck2,
  target: Target,
  spark: Sparkles,
  layers: Layers3,
  trophy: Trophy,
  brain: BrainCircuit,
  repeat: Repeat2,
  clock: Clock3,
  pencil: DraftingCompass,
  publish: Send,
  constellation: Orbit,
};

interface AchievementBadgeProps {
  badge: EvaluatedBadge;
  compact?: boolean;
}

export default function AchievementBadge({ badge, compact = false }: AchievementBadgeProps) {
  const Icon = icons[badge.icon];
  const familyLabel = badge.family === "mastery" ? "concepts" : badge.family;
  return (
    <article
      className={`achievement-badge ${compact ? "is-compact" : ""} ${badge.earned ? "is-earned" : "is-locked"}`}
      data-family={badge.family}
      aria-label={`${badge.name}. ${badge.earned ? "Earned." : `${badge.progressLabel}.`} ${badge.description}`}
    >
      <span className="badge-emblem" aria-hidden="true">
        <span><Icon size={compact ? 18 : 22} strokeWidth={1.9} /></span>
        {badge.earned && <i><Check size={11} strokeWidth={3} /></i>}
      </span>
      <span className="badge-copy">
        <span className="badge-title-row"><strong>{badge.name}</strong><small>{badge.earned ? "Earned" : familyLabel}</small></span>
        {!compact && <span className="badge-description">{badge.description}</span>}
        <span className="badge-progress" aria-hidden="true"><i><b style={{ width: `${badge.progressPercent}%` }} /></i><em>{badge.progressLabel}</em></span>
      </span>
    </article>
  );
}
