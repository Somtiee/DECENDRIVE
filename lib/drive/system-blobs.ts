/** Walrus blobs created by DecenDrive internals — never show in My Drive / Trash. */

export function isSystemWalrusBlob(input: {
  name?: string;
  purpose?: string;
}): boolean {
  const purpose = input.purpose?.trim().toLowerCase();
  if (purpose === "drive-state") {
    return true;
  }
  const name = (input.name ?? "").trim().toLowerCase();
  return name.startsWith("decendrive-") && name.endsWith(".json");
}
