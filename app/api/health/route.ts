import { NextResponse } from "next/server";

import { getSuiClient, validateSuiMainnetConnection } from "@/lib/sui/client";

export async function GET() {
  try {
    const client = getSuiClient();
    const checkpoint = await validateSuiMainnetConnection();

    return NextResponse.json(
      {
        ok: true,
        network: "mainnet",
        endpoint: "https://sui-mainnet.gateway.tatum.io",
        checkpoint,
        chainId: await client.getChainIdentifier(),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to reach Sui RPC.",
      },
      { status: 503 },
    );
  }
}
