"use client";

import "@mysten/dapp-kit/dist/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { ReactNode, useState } from "react";
import { Toaster } from "sonner";

import { getSuiClient } from "@/lib/sui/client";

const networks = {
  mainnet: getSuiClient(),
};

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider autoConnect={false}>{children}</WalletProvider>
      </SuiClientProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
