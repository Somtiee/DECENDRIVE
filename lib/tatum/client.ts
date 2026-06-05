import { TatumSDK } from "@tatumio/tatum";

let tatumClientPromise: Promise<{ sdk: typeof TatumSDK; apiKey: string }> | null = null;

export async function getTatumClient() {
  if (tatumClientPromise) {
    return tatumClientPromise;
  }

  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    throw new Error("TATUM_API_KEY is required for Tatum RPC fallback.");
  }

  tatumClientPromise = Promise.resolve({
    sdk: TatumSDK,
    apiKey,
  });

  return tatumClientPromise;
}

export function getTatumRpcConfig() {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    throw new Error("TATUM_API_KEY is required for Tatum RPC fallback.");
  }

  return {
    url: "https://api.tatum.io/v3/blockchain/node/sui-mainnet",
    headers: {
      "x-api-key": apiKey,
    },
  };
}
