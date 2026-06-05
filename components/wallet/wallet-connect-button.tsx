"use client";

import { ConnectButton, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { Copy, LogOut } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/utils";

export function WalletConnectButton() {
  const account = useCurrentAccount();
  const { mutate: disconnect, isPending } = useDisconnectWallet();
  const [copying, setCopying] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!account?.address || copying) {
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.writeText(account.address);
      toast.success("Wallet address copied.");
    } catch {
      toast.error("Could not copy address.");
    } finally {
      setCopying(false);
    }
  }, [account?.address, copying]);

  if (!account) {
    return (
      <div className="flex shrink-0 items-center">
        <ConnectButton connectText="Connect" />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <button
        type="button"
        onClick={() => void copyAddress()}
        disabled={copying}
        title="Tap to copy full wallet address"
        aria-label={`Copy wallet address ${account.address}`}
        className="group inline-flex max-w-[5.75rem] items-center gap-1 rounded-md border border-border bg-secondary/80 px-1.5 py-1.5 text-[10px] font-medium text-foreground transition hover:border-sky-400/50 hover:bg-sky-500/10 sm:max-w-none sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-xs md:px-3"
      >
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground transition group-hover:text-sky-300" aria-hidden />
        <span className="truncate">{shortenAddress(account.address)}</span>
      </button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 px-2 sm:h-9 sm:px-3"
        onClick={() => disconnect()}
        disabled={isPending}
        aria-label="Disconnect wallet"
      >
        <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2" />
        <span className="hidden sm:inline">Disconnect</span>
      </Button>
    </div>
  );
}
