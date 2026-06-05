"use client";

import { KeyRound, Link2, Lock, ShieldCheck, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const BADGE_STYLES = {
  encrypted: "border-sky-500/35 bg-sky-500/10 text-sky-200",
  onchain: "border-violet-500/35 bg-violet-500/10 text-violet-200",
  walrus: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  "local-decrypt": "border-amber-500/35 bg-amber-500/10 text-amber-200",
  wallet: "border-slate-500/50 bg-slate-500/10 text-slate-200",
} as const;

export type TrustBadgeKind = keyof typeof BADGE_STYLES;

const BADGE_ICONS: Record<TrustBadgeKind, typeof Lock> = {
  encrypted: Lock,
  onchain: Link2,
  walrus: ShieldCheck,
  "local-decrypt": KeyRound,
  wallet: Sparkles,
};

const BADGE_LABELS: Record<TrustBadgeKind, string> = {
  encrypted: "Seal encrypted",
  onchain: "On-chain rules",
  walrus: "Walrus storage",
  "local-decrypt": "Local decrypt",
  wallet: "Wallet-gated",
};

type TrustBadgeProps = {
  kind: TrustBadgeKind;
  className?: string;
  label?: string;
};

export function TrustBadge({ kind, className, label }: TrustBadgeProps) {
  const Icon = BADGE_ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        BADGE_STYLES[kind],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
      {label ?? BADGE_LABELS[kind]}
    </span>
  );
}

export function TrustBadgeRow({
  kinds,
  className,
}: {
  kinds: TrustBadgeKind[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {kinds.map((kind) => (
        <TrustBadge key={kind} kind={kind} />
      ))}
    </div>
  );
}
