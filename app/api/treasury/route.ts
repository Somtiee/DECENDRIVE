import { NextResponse } from "next/server";

import { treasuryAddress } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    treasuryAddress,
  });
}
