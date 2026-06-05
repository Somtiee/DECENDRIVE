import { bcs } from "@mysten/sui/bcs";

/**
 * Walrus stores a blob's id on-chain as a u256 (decimal string), but the HTTP
 * aggregator and SDK use the URL-safe base64 form. Convert decimal -> base64url
 * so links, previews, and the local metadata index all line up.
 *
 * Values that are already base64url (e.g. straight from an upload) pass through.
 */
export function toWalrusBlobId(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^\d+$/.test(trimmed)) {
    return bcs
      .u256()
      .serialize(BigInt(trimmed))
      .toBase64()
      .replace(/=*$/, "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
  }

  return trimmed;
}
