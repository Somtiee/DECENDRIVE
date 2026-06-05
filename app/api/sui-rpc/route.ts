import { NextRequest, NextResponse } from "next/server";

import { tatumApiKey } from "@/lib/env";

const TATUM_RPC_URL = "https://sui-mainnet.gateway.tatum.io";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 5000;

type RpcRequest = {
  id?: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRpcId(rawBody: string) {
  try {
    const payload = JSON.parse(rawBody) as RpcRequest | RpcRequest[];
    if (Array.isArray(payload)) {
      return payload[0]?.id ?? null;
    }
    return payload.id ?? null;
  } catch {
    return null;
  }
}

function getRetryDelayMs(attempt: number, retryAfterHeader: string | null) {
  const seconds = Number(retryAfterHeader ?? "");
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
  }

  const backoff = BASE_RETRY_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(MAX_RETRY_DELAY_MS, backoff + jitter);
}

function rpcErrorResponse(id: unknown, message: string) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: -32029,
        message,
      },
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const rpcId = parseRpcId(body);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(TATUM_RPC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": tatumApiKey,
          },
          body,
          cache: "no-store",
        });

        if (response.ok) {
          const text = await response.text();
          return new NextResponse(text, {
            status: response.status,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt < MAX_RETRIES) {
            const delayMs = getRetryDelayMs(attempt, response.headers.get("retry-after"));
            await sleep(delayMs);
            continue;
          }

          if (response.status === 429) {
            return rpcErrorResponse(
              rpcId,
              "RPC is rate-limited right now. Please retry in a few seconds.",
            );
          }

          return rpcErrorResponse(
            rpcId,
            "RPC service is temporarily unavailable. Please retry shortly.",
          );
        }

        const text = await response.text();
        return new NextResponse(text, {
          status: response.status,
          headers: {
            "content-type": "application/json",
          },
        });
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          const delayMs = getRetryDelayMs(attempt, null);
          await sleep(delayMs);
          continue;
        }
      }
    }

    return rpcErrorResponse(
      parseRpcId(body),
      lastError instanceof Error
        ? `RPC request failed after retries: ${lastError.message}`
        : "RPC request failed after retries. Please retry.",
    );
  } catch {
    return NextResponse.json(
      {
        error: "Tatum Sui RPC proxy request failed.",
      },
      { status: 500 },
    );
  }
}
