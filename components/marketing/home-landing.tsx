import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  FolderKanban,
  HardDrive,
  Inbox,
  KeyRound,
  RotateCcw,
  Share2,
  Shield,
  Trash2,
  Wallet,
} from "lucide-react";

import { TrustPillars } from "@/components/drive/trust";
import {
  DECENDRIVE_TAGLINE,
  LANDING_FEATURES,
  LANDING_HERO,
  LANDING_STACK,
  LANDING_WHY,
} from "@/components/drive/trust/copy";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";

const WORKFLOW = [
  { step: "01", title: "Connect wallet", body: "Your Sui address becomes your identity and encryption root." },
  { step: "02", title: "Encrypt & upload", body: "Seal seals files locally; Walrus stores blobs; Sui registers your File record." },
  { step: "03", title: "Share by wallet", body: "Send on-chain ShareInvitation objects — recipients accept under Received." },
  { step: "04", title: "Control access", body: "Revoke or restore each share independently from the Shared tab." },
] as const;

export function HomeLanding() {
  return (
    <div className="landing-grid-glow min-h-screen">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="DecenDrive"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight sm:text-lg">DecenDrive</p>
              <p className="hidden text-[10px] text-muted-foreground sm:block">You hold the keys · Rules on-chain</p>
            </div>
          </Link>
          <WalletConnectButton />
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:min-h-[calc(100vh-4rem)] sm:px-6 sm:py-24">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90 sm:text-sm">
          {LANDING_HERO.eyebrow}
        </p>
        <h1 className="mx-auto max-w-4xl text-center text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl lg:text-[3.4rem]">
          {LANDING_HERO.title}
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground sm:text-base md:text-lg">
          {LANDING_HERO.subtitle}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-muted-foreground/90 sm:text-sm">
          {DECENDRIVE_TAGLINE}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:mt-12">
          <Link
            href="/dashboard"
            className="landing-cta-neon inline-flex h-14 min-w-[220px] items-center justify-center gap-2 rounded-xl px-10 text-base font-semibold text-white sm:h-16 sm:min-w-[260px] sm:text-lg"
          >
            Open Drive
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <p className="text-center text-[11px] text-muted-foreground sm:text-xs">
            Sui mainnet · Walrus · Seal · Wallet-native sharing
          </p>
        </div>
      </section>

      <section className="border-y border-border/50 bg-card/30 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center sm:mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Platform</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
              One drive for encrypted storage, wallet shares, and on-chain access rules
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Built for people who want real file control — encrypted storage, wallet-native sharing, and on-chain access
              rules in one place.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {LANDING_FEATURES.map((feature) => (
              <article
                key={feature.id}
                className="group flex flex-col rounded-2xl border border-border/70 bg-background/50 p-6 transition hover:border-sky-500/35 hover:bg-background/70 sm:p-8"
              >
                <span className="text-2xl text-sky-300/90" aria-hidden>
                  {feature.symbol}
                </span>
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-sky-400">{feature.title}</p>
                <h3 className="mt-2 text-lg font-semibold leading-snug sm:text-xl">{feature.headline}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                <Link
                  href={feature.href}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-sky-300 transition group-hover:gap-2 group-hover:text-sky-200"
                >
                  {feature.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Why DecenDrive</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                The unified wallet-native cloud we actually shipped
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Not a roadmap slide — live on Sui mainnet today. Upload, share, receive, revoke, trash, and renew Walrus
                rent from one dashboard that treats your wallet as the root of trust.
              </p>
              <ul className="mt-8 space-y-4">
                {LANDING_WHY.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/50 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">In the app today</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: FolderKanban, label: "My Drive", desc: "Folders, rename, trash" },
                  { icon: Share2, label: "Shared", desc: "Revoke & restore per invite" },
                  { icon: Inbox, label: "Received", desc: "Pending · accept · download" },
                  { icon: HardDrive, label: "Storage rent", desc: "Batch Walrus renewal" },
                  { icon: Trash2, label: "Trash", desc: "30-day on-chain retention" },
                  { icon: Ban, label: "Revoked tag", desc: "Recipients see access state" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-3"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/50 bg-card/20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-sky-400/80">How it works</p>
          <h2 className="mt-2 text-center text-2xl font-bold sm:text-3xl">From wallet connect to controlled sharing</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-border/60 bg-background/40 p-5 sm:p-6"
              >
                <p className="text-3xl font-bold text-sky-500/30">{item.step}</p>
                <p className="mt-2 font-semibold">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold sm:text-2xl">Built on</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_STACK.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border/60 bg-card/40 px-4 py-4 text-center sm:px-5"
              >
                <p className="font-semibold text-sky-200">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2 text-sky-300">
              <Shield className="h-5 w-5" aria-hidden />
              <KeyRound className="h-5 w-5" aria-hidden />
              <Wallet className="h-5 w-5" aria-hidden />
              <RotateCcw className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="text-xl font-bold sm:text-2xl">Trust by design</h2>
          </div>
          <TrustPillars />
        </div>
      </section>

      <section className="border-t border-border/50 bg-card/30 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-4xl">Ready to open your drive?</h2>
          <p className="mt-4 text-sm text-muted-foreground sm:text-base">
            Connect your Sui wallet, upload your first sealed file, and share with anyone on mainnet.
          </p>
          <Link
            href="/dashboard"
            className="landing-cta-neon mt-8 inline-flex h-14 min-w-[220px] items-center justify-center gap-2 rounded-xl px-10 text-base font-semibold text-white sm:h-16 sm:text-lg"
          >
            Open Drive
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
