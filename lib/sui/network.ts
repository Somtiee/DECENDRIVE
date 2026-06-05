export const DEFAULT_SUI_NETWORK = "mainnet";
export type SuiNetwork = "mainnet";

export function getSuiNetwork(): SuiNetwork {
  return DEFAULT_SUI_NETWORK;
}
