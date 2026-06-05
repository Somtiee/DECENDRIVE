import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const MAINNET_NETWORK = "mainnet";
const TATUM_SUI_MAINNET_RPC_URL = "https://sui-mainnet.gateway.tatum.io";
const INTERNAL_RPC_PROXY_PATH = "/api/sui-rpc";

let singletonClient: SuiJsonRpcClient | null = null;

function assertMainnetOnly() {
  const configuredNetwork = process.env.NEXT_PUBLIC_SUI_NETWORK?.toLowerCase();
  if (configuredNetwork && configuredNetwork !== MAINNET_NETWORK) {
    throw new Error("DecenDrive is configured for Sui mainnet only.");
  }
}

function getServerHeaders() {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return { "x-api-key": apiKey };
}

function createClient() {
  assertMainnetOnly();
  const url = typeof window === "undefined" ? TATUM_SUI_MAINNET_RPC_URL : INTERNAL_RPC_PROXY_PATH;

  return new SuiJsonRpcClient({
    network: MAINNET_NETWORK,
    transport: new JsonRpcHTTPTransport({
      url,
      rpc: {
        headers: typeof window === "undefined" ? getServerHeaders() : undefined,
      },
    }),
  });
}

export function getSuiClient() {
  if (!singletonClient) {
    singletonClient = createClient();
  }
  return singletonClient;
}

export const suiClient = getSuiClient();

export async function validateSuiMainnetConnection() {
  assertMainnetOnly();
  const checkpoint = await getSuiClient().getLatestCheckpointSequenceNumber();
  if (typeof checkpoint !== "string" && typeof checkpoint !== "number") {
    throw new Error("Invalid checkpoint response from Tatum Sui mainnet RPC.");
  }
  return checkpoint;
}
