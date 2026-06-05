/** Core product positioning — keep in sync across marketing and in-app trust UI */
export const DECENDRIVE_TAGLINE =
  "A familiar drive experience — you hold the keys, the rules are on-chain, and the host can't read your files.";

export const LANDING_HERO = {
  eyebrow: "Privacy-first decentralized personal cloud",
  title: "Your files on Sui & Walrus — encrypted, shared, and ruled by your wallet.",
  subtitle:
    "DecenDrive is a wallet-native personal vault with the clarity of a modern file drive: Seal encryption before upload, Walrus decentralized storage, on-chain file records on Sui mainnet, and wallet-to-wallet sharing with per-invitation revoke and restore.",
} as const;

export const LANDING_FEATURES = [
  {
    id: "vault",
    symbol: "◈",
    title: "Encrypt & upload",
    headline: "Client-side Seal encryption before anything hits the network",
    description:
      "Files are sealed with keys derived from your Sui wallet. Walrus stores the ciphertext; DecenDrive registers ownership and metadata on-chain. You renew storage rent on your schedule from the Storage rent tab.",
    cta: "Start uploading",
    href: "/dashboard",
  },
  {
    id: "share",
    symbol: "↔",
    title: "Wallet share",
    headline: "On-chain invitations to any Sui wallet",
    description:
      "Share files or folders by recipient address. They preview under Received → Pending, then accept to keep access. View and download permissions are enforced when they decrypt with their own wallet.",
    cta: "Share with wallet",
    href: "/dashboard",
  },
  {
    id: "revoke",
    symbol: "✦",
    title: "Revoke & restore",
    headline: "Per-share access control — not per filename",
    description:
      "Revoke or restore each invitation independently, even when the same file was uploaded twice. Access state is recorded per ShareInvitation on your on-chain File object — recipients see a Revoked tag instantly.",
    cta: "Manage shared",
    href: "/dashboard",
  },
] as const;

export const LANDING_WHY = [
  "Seal encryption means the host and storage layer never see plaintext — only wallets with the wrapped key can decrypt.",
  "Share invitations are Move objects delivered to the recipient's wallet; accept and decline are on-chain transactions with verifiable digests.",
  "Revoke and restore target individual invitations, so duplicate uploads and duplicate shares stay independent.",
  "Trash, display names, and drive layout sync to Sui — deleted items live in Trash for 30 days before permanent removal.",
  "Walrus storage rent is visible per file; renew expired blobs in batch without wallet popups on every connect.",
  "No public links or password gates — access is wallet-gated by design, with on-chain rules you control.",
] as const;

export const LANDING_STACK = [
  { label: "Sui mainnet", detail: "File records, shares, trash, metadata" },
  { label: "Walrus", detail: "Decentralized blob storage" },
  { label: "Seal", detail: "Wallet-derived encryption" },
  { label: "Tatum RPC", detail: "Resilient mainnet reads" },
] as const;

export const TRUST_PILLARS = [
  {
    id: "keys",
    title: "You hold the keys",
    description: "Encryption keys are derived from your wallet. DecenDrive never sees your plaintext.",
  },
  {
    id: "rules",
    title: "Rules on-chain",
    description: "Share invitations and file access rules are recorded on Sui mainnet.",
  },
  {
    id: "host",
    title: "Host can't read",
    description: "Files are encrypted with Seal before Walrus storage. Only permitted wallets can decrypt.",
  },
] as const;

export type DriveTrustView = "my-drive" | "trash" | "storage-rent" | "shared" | "received" | "upload";

export const VIEW_TRUST_COPY: Record<
  DriveTrustView,
  { headline: string; detail: string }
> = {
  "my-drive": {
    headline: "Your vault — encrypted before it leaves this device",
    detail:
      "Uploads are sealed client-side, stored on Walrus, and registered on Sui. Renew expired storage rent from the Storage rent tab when needed. Filenames and trash state live on-chain.",
  },
  "storage-rent": {
    headline: "Renew Walrus storage rent on your schedule",
    detail:
      "No wallet popups on connect. Review expired files here, select what to restore, and renew all in one transaction.",
  },
  trash: {
    headline: "Trash is on-chain — deleted items stay here for 30 days",
    detail:
      "Deleting moves files to Trash on Sui. After 30 days they are removed automatically. Delete permanently destroys deletable Walrus blobs on-chain.",
  },
  shared: {
    headline: "Outgoing shares are on-chain invitations",
    detail:
      "Recipients must accept with their wallet. Permissions (view / download) are enforced when they decrypt.",
  },
  received: {
    headline: "Incoming shares — only your wallet unwraps the key",
    detail:
      "Preview and download decrypt in your browser. Accepting records the invitation on Sui mainnet.",
  },
  upload: {
    headline: "Encrypt → Walrus → Register on Sui",
    detail:
      "Seal encryption, decentralized Walrus storage, and a mainnet transaction digest you can verify. Renew expired rent anytime from the Storage rent tab.",
  },
};
