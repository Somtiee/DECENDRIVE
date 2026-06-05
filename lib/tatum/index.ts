import "server-only";

import { TatumSDK } from "@tatumio/tatum";

export const TATUM_SUI_MAINNET_RPC_URL = "https://sui-mainnet.gateway.tatum.io";

type TatumServerClient = {
  sdk: typeof TatumSDK;
  apiKey: string;
  rpcUrl: string;
};

let tatumClientPromise: Promise<TatumServerClient> | null = null;

export function getTatumApiKey() {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TATUM_API_KEY. Add it in your server environment.");
  }
  return apiKey;
}

export function getServerTatumConfig() {
  return {
    apiKey: getTatumApiKey(),
    rpcUrl: TATUM_SUI_MAINNET_RPC_URL,
    headers: {
      "x-api-key": getTatumApiKey(),
    },
  };
}

export async function getTatumServerClient() {
  if (!tatumClientPromise) {
    const config = getServerTatumConfig();

    // Sui Data API support will be attached here once the SDK surface is exposed.
    tatumClientPromise = Promise.resolve({
      sdk: TatumSDK,
      apiKey: config.apiKey,
      rpcUrl: config.rpcUrl,
    });
  }

  return tatumClientPromise;
}

/**
 * Low-level JSON-RPC call against the Tatum Sui mainnet gateway (server-only).
 * Used by the file query routes to read on-chain objects via Tatum Data infra.
 */
export async function tatumSuiRpc<T = unknown>(
  method: string,
  params: unknown[],
): Promise<T> {
  const { suiJsonRpc } = await import("@/lib/sui/rpc-resilient");
  return suiJsonRpc<T>(method, params);
}

/**
 * Query File objects owned by an address through the Tatum Sui gateway.
 */
export async function getOwnedObjectsViaTatum(owner: string, structType?: string) {
  return tatumSuiRpc("suix_getOwnedObjects", [
    owner,
    {
      filter: structType ? { StructType: structType } : undefined,
      options: { showContent: true, showType: true, showOwner: true },
    },
  ]);
}
