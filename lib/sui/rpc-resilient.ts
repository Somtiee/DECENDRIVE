import "server-only";

const TATUM_RPC_URL = "https://sui-mainnet.gateway.tatum.io";
const PUBLIC_SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfter: string | null) {
  const seconds = Number(retryAfter ?? "");
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(MAX_DELAY_MS, Math.ceil(seconds * 1000));
  }
  const backoff = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_DELAY_MS, backoff + jitter);
}

async function postJsonRpc(
  url: string,
  method: string,
  params: unknown[],
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; payload: { result?: unknown; error?: { message?: string } } }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };

  return { ok: response.ok, status: response.status, payload };
}

/**
 * Server-side Sui JSON-RPC with Tatum retries and public fullnode fallback.
 * Avoids surfacing raw 429 errors when the primary gateway is rate-limited.
 */
export async function suiJsonRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const apiKey = process.env.TATUM_API_KEY ?? null;

  let lastError = "Sui RPC request failed.";

  if (apiKey) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const { ok, status, payload } = await postJsonRpc(TATUM_RPC_URL, method, params, {
          "x-api-key": apiKey,
        });

        if (ok && !payload.error) {
          return payload.result as T;
        }

        if (payload.error?.message) {
          lastError = payload.error.message;
        } else if (!ok) {
          lastError = `RPC ${method} failed with status ${status}.`;
        }

        if ((status === 429 || status >= 500) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(attempt, null));
          continue;
        }

        if (status !== 429 && status < 500 && ok && payload.error) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(attempt, null));
        }
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { ok, status, payload } = await postJsonRpc(
        PUBLIC_SUI_MAINNET_RPC,
        method,
        params,
        {},
      );

      if (ok && !payload.error) {
        return payload.result as T;
      }

      if (payload.error?.message) {
        lastError = payload.error.message;
      } else if (!ok) {
        lastError = `Public RPC ${method} failed with status ${status}.`;
      }

      if (attempt < 1) {
        await sleep(retryDelayMs(attempt, null));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < 1) {
        await sleep(retryDelayMs(attempt, null));
      }
    }
  }

  if (lastError.includes("429") || lastError.toLowerCase().includes("rate")) {
    throw new Error(
      "Sui network is busy right now. Your files are still on-chain — please wait a few seconds and try again.",
    );
  }

  throw new Error(lastError);
}

export type ResilientEventRow = {
  type?: string;
  id?: { txDigest?: string };
  parsedJson?: Record<string, unknown>;
};

export type ResilientQueryEventsResult = {
  data: ResilientEventRow[];
  hasNextPage: boolean;
  nextCursor: string | null;
};

function normalizeQueryEventsResult(raw: unknown): ResilientQueryEventsResult {
  const record = (raw ?? {}) as {
    data?: ResilientEventRow[];
    hasNextPage?: boolean;
    nextCursor?: string | null;
  };
  return {
    data: record.data ?? [],
    hasNextPage: Boolean(record.hasNextPage),
    nextCursor: record.nextCursor ?? null,
  };
}

/**
 * Query Sui events with Tatum legacy params and public-fullnode modern params.
 * The raw Tatum gateway rejects `{ query: { Sender } }` but accepts `{ Sender }`.
 */
export async function queryEventsResilient(
  filter: { Sender?: string; MoveEventType?: string },
  options: {
    cursor?: string | null;
    limit?: number;
    order?: "ascending" | "descending";
  } = {},
): Promise<ResilientQueryEventsResult> {
  const limit = options.limit ?? 50;
  const descending = (options.order ?? "descending") === "descending";
  const cursor = options.cursor ?? null;
  const apiKey = process.env.TATUM_API_KEY ?? null;
  let lastError = "Sui event query failed.";

  if (apiKey) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const { ok, status, payload } = await postJsonRpc(
          TATUM_RPC_URL,
          "suix_queryEvents",
          [filter, cursor, limit, descending],
          { "x-api-key": apiKey },
        );
        if (ok && !payload.error) {
          return normalizeQueryEventsResult(payload.result);
        }
        if (payload.error?.message) {
          lastError = payload.error.message;
        }
        if ((status === 429 || status >= 500) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(attempt, null));
          continue;
        }
        if (status !== 429 && status < 500 && ok && payload.error) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelayMs(attempt, null));
        }
      }
    }
  }

  const modernParams = [
    {
      query: filter,
      cursor,
      limit,
      order: descending ? "descending" : "ascending",
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { ok, status, payload } = await postJsonRpc(
        PUBLIC_SUI_MAINNET_RPC,
        "suix_queryEvents",
        modernParams,
        {},
      );
      if (ok && !payload.error) {
        return normalizeQueryEventsResult(payload.result);
      }
      if (payload.error?.message) {
        lastError = payload.error.message;
      } else if (!ok) {
        lastError = `Public RPC suix_queryEvents failed with status ${status}.`;
      }
      if (attempt < 1) {
        await sleep(retryDelayMs(attempt, null));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < 1) {
        await sleep(retryDelayMs(attempt, null));
      }
    }
  }

  if (lastError.includes("429") || lastError.toLowerCase().includes("rate")) {
    throw new Error(
      "Sui network is busy right now. Your files are still on-chain — please wait a few seconds and try again.",
    );
  }

  throw new Error(lastError);
}

export type ResilientObjectResponse = {
  data?: {
    objectId?: string;
    content?: Record<string, unknown>;
  } | null;
};

export async function multiGetObjectsResilient(
  ids: string[],
  options: { showContent?: boolean } = {},
): Promise<ResilientObjectResponse[]> {
  if (ids.length === 0) {
    return [];
  }

  const result = await suiJsonRpc<ResilientObjectResponse[]>("sui_multiGetObjects", [
    ids,
    {
      showContent: options.showContent ?? true,
    },
  ]);

  return Array.isArray(result) ? result : [];
}
