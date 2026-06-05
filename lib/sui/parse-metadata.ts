/** Parse Move VecMap<String,String> from Sui object content fields. */
export function parseVecMapMetadata(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const fields = (record.fields ?? record) as Record<string, unknown>;

  const contents = fields.contents ?? fields.entries;
  if (!Array.isArray(contents)) {
    return {};
  }

  const map: Record<string, string> = {};
  for (const entry of contents) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const entryFields = (entry as Record<string, unknown>).fields as Record<string, unknown> | undefined;
    if (!entryFields) {
      continue;
    }
    const key = String(entryFields.key ?? entryFields.name ?? "");
    const value = String(entryFields.value ?? "");
    if (key) {
      map[key] = value;
    }
  }
  return map;
}

export const DRIVE_ANCHOR_KEY = "drive_anchor";
export const DRIVE_STATE_BLOB_KEY = "drive_state_blob_id";
export const DRIVE_STATE_VERSION_KEY = "drive_state_version";
