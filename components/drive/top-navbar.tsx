"use client";

import Image from "next/image";
import Link from "next/link";
import { DriveSearchBox } from "@/components/drive/DriveSearchBox";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";

export function TopNavbar() {
  return (
    <header className="sticky top-0 z-40 flex min-h-14 w-full items-center gap-1.5 border-b border-border/70 bg-background px-2 py-1.5 sm:min-h-16 sm:gap-2 sm:px-3 md:gap-3 md:px-6">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-1.5 sm:gap-2"
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
          className="h-7 w-7 shrink-0 rounded-md object-cover sm:h-8 sm:w-8"
          priority
        />
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="truncate text-base font-semibold leading-tight tracking-tight text-foreground md:text-lg">
            DecenDrive
          </span>
          <span className="hidden truncate text-[10px] font-medium text-muted-foreground lg:inline">
            You hold the keys · Rules on-chain
          </span>
        </span>
      </Link>

      <div className="min-w-0 flex-1">
        <DriveSearchBox />
      </div>

      <div className="flex shrink-0 items-center">
        <WalletConnectButton />
      </div>
    </header>
  );
}
