"use client";

import Image from "next/image";
import Link from "next/link";
import { DriveSearchBox } from "@/components/drive/DriveSearchBox";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";

export function TopNavbar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 min-h-14 items-center gap-2 border-b border-border/70 bg-background/95 px-3 backdrop-blur sm:h-16 sm:min-h-16 md:gap-4 md:px-6">
      <Link
        href="/"
        className="flex items-center gap-2"
        aria-label="Go to DecenDrive landing page"
        title="DecenDrive"
        onClick={(event) => {
          event.preventDefault();
          window.location.href = "/";
        }}
      >
        <Image
          src="/logo.png"
          alt="DecenDrive logo"
          width={32}
          height={32}
          className="h-8 w-8 rounded-md object-cover"
        />
        <span className="hidden flex-col sm:flex">
          <span className="text-lg font-semibold leading-tight tracking-tight text-foreground">
            DecenDrive
          </span>
          <span className="hidden text-[10px] font-medium text-muted-foreground lg:inline">
            You hold the keys · Rules on-chain
          </span>
        </span>
      </Link>
      <DriveSearchBox />
      <div className="ml-auto flex items-center gap-2">
        <WalletConnectButton />
      </div>
    </header>
  );
}
