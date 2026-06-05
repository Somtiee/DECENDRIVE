/** Sui mainnet block explorer links for on-chain proof. */
const SUI_MAINNET_EXPLORER_TX = "https://suiscan.xyz/mainnet/tx";
const SUI_MAINNET_EXPLORER_OBJECT = "https://suiscan.xyz/mainnet/object";
const SUI_MAINNET_EXPLORER_ACCOUNT = "https://suiscan.xyz/mainnet/account";

export function suiMainnetTxExplorerUrl(digest: string) {
  return `${SUI_MAINNET_EXPLORER_TX}/${digest}`;
}

export function suiMainnetObjectExplorerUrl(objectId: string) {
  return `${SUI_MAINNET_EXPLORER_OBJECT}/${objectId}`;
}

export function suiMainnetAccountExplorerUrl(address: string) {
  return `${SUI_MAINNET_EXPLORER_ACCOUNT}/${address}`;
}

export function shortenTxDigest(digest: string, head = 8, tail = 6) {
  if (digest.length <= head + tail + 1) {
    return digest;
  }
  return `${digest.slice(0, head)}…${digest.slice(-tail)}`;
}
