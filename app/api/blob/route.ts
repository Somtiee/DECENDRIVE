import { NextRequest, NextResponse } from "next/server";

// Fetching the encrypted blob server-side avoids browser CORS limits and lets us
// fail over between public mainnet aggregators when one is slow or returns 503.
// Larger blobs (e.g. video) require the aggregator to reconstruct from many
// storage nodes, so we try several known-good aggregators with a generous timeout.
const WALRUS_AGGREGATORS = [
  "https://aggregator.walrus-mainnet.walrus.space",
  "https://aggregator.mainnet.walrus.mirai.cloud",
  "https://walrus.globalstake.io",
  "https://sui-walrus-mainnet-aggregator.bwarelabs.com",
  "https://walrus-aggregator.starduststaking.com",
  "https://walrus-mainnet-aggregator.nodeinfra.com",
];

const FETCH_TIMEOUT_MS = 45_000;
const MAX_PASSES = 2;
const RETRY_DELAY_MS = 800;
// Encrypted payloads are always larger than this (12-byte IV + 16-byte GCM tag).
const MIN_BLOB_BYTES = 32;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Some aggregators answer with HTTP 200 but a tiny text/JSON error body
// (e.g. "Internal server error"). Treat those as failures, not real blobs.
function looksLikeErrorBody(contentType: string | null, byteLength: number) {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("text/") || type.includes("application/json") || type.includes("text/html")) {
    return true;
  }
  return byteLength < MIN_BLOB_BYTES;
}

export async function GET(request: NextRequest) {
  const blobId = request.nextUrl.searchParams.get("blobId");
  if (!blobId) {
    return NextResponse.json({ error: "Missing blobId" }, { status: 400 });
  }

  let lastStatus = 502;
  let sawNotFound = false;
  const path = `/v1/blobs/${encodeURIComponent(blobId)}`;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    for (const base of WALRUS_AGGREGATORS) {
      try {
        const upstream = await fetch(`${base}${path}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (upstream.ok) {
          const buffer = await upstream.arrayBuffer();
          if (looksLikeErrorBody(upstream.headers.get("content-type"), buffer.byteLength)) {
            // False-positive 200 from a flaky aggregator — keep trying others.
            continue;
          }
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "content-type": "application/octet-stream",
              "cache-control": "private, max-age=300",
            },
          });
        }

        lastStatus = upstream.status;
        if (upstream.status === 404) {
          sawNotFound = true;
        }
      } catch {
        // Network/timeout — try the next aggregator.
      }
    }

    if (pass < MAX_PASSES - 1) {
      await delay(RETRY_DELAY_MS);
    }
  }

  // If every aggregator that answered said 404, the blob data isn't stored —
  // surface that clearly so the UI can tell the user to re-upload.
  return NextResponse.json(
    { error: "Blob could not be retrieved from Walrus aggregators." },
    { status: sawNotFound ? 404 : 503 },
  );
}
