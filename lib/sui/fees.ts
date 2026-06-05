import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";

/** Treasury service fee on upload (excludes WAL storage swap). */
export function calculateDynamicFeeSui(fileSizeBytes: number) {
  const fee = Math.min(0.1, 0.0005 + (fileSizeBytes / 1_000_000_000) * 0.008);
  return fee;
}

/** Share treasury fee = half of upload treasury fee for the same file size. */
export function calculateShareFeeSui(fileSizeBytes: number) {
  return calculateDynamicFeeSui(fileSizeBytes) / 2;
}

export function toPremiumFeeLabel(feeSui: number) {
  const rounded = Math.max(0.001, Math.ceil(feeSui * 1000) / 1000);
  return `~${rounded.toFixed(3)} SUI`;
}

async function getTreasuryAddress() {
  const response = await fetch("/api/treasury", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Treasury service is unavailable.");
  }

  const data = (await response.json()) as { treasuryAddress?: string };
  if (!data.treasuryAddress || !isValidSuiAddress(data.treasuryAddress)) {
    throw new Error("Treasury address is not configured correctly.");
  }

  return data.treasuryAddress;
}

/** Split gas and transfer SUI to the configured treasury (same path as uploads). */
export async function appendTreasuryFee(tx: Transaction, feeSui: number) {
  if (feeSui <= 0) {
    return;
  }

  const treasuryAddress = await getTreasuryAddress();
  const treasuryFeeMist = BigInt(Math.ceil(feeSui * 1_000_000_000));
  const [treasuryCoin] = tx.splitCoins(tx.gas, [treasuryFeeMist]);
  tx.transferObjects([treasuryCoin], treasuryAddress);
}
