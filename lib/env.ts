import "server-only";

export const treasuryAddress = process.env.TREASURY_ADDRESS!;
export const tatumApiKey = process.env.TATUM_API_KEY!;

if (!treasuryAddress) {
  throw new Error("Missing TREASURY_ADDRESS in environment.");
}

if (!tatumApiKey) {
  throw new Error("Missing TATUM_API_KEY in environment.");
}
