export function normalizeRecipientAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function parseRevokedRecipients(raw: string | undefined | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => normalizeRecipientAddress(entry))
    .filter(Boolean);
}

export function serializeRevokedRecipients(recipients: Iterable<string>): string {
  return [...new Set([...recipients].map(normalizeRecipientAddress))].join(",");
}

export function isRecipientRevoked(raw: string | undefined | null, recipient: string): boolean {
  const normalized = normalizeRecipientAddress(recipient);
  return parseRevokedRecipients(raw).includes(normalized);
}

export function removeRevokedRecipient(raw: string | undefined | null, recipient: string): string {
  const normalized = normalizeRecipientAddress(recipient);
  return serializeRevokedRecipients(
    parseRevokedRecipients(raw).filter((entry) => entry !== normalized),
  );
}

function normalizeInvitationId(invitationId: string): string {
  return invitationId.trim().toLowerCase();
}

export function parseRevokedInvitations(raw: string | undefined | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => normalizeInvitationId(entry))
    .filter(Boolean);
}

export function serializeRevokedInvitations(invitationIds: Iterable<string>): string {
  return [...new Set([...invitationIds].map(normalizeInvitationId))].join(",");
}

export function isInvitationRevoked(
  raw: string | undefined | null,
  invitationId: string,
): boolean {
  const normalized = normalizeInvitationId(invitationId);
  return parseRevokedInvitations(raw).includes(normalized);
}

export function addRevokedInvitation(
  raw: string | undefined | null,
  invitationId: string,
): string {
  const current = new Set(parseRevokedInvitations(raw));
  current.add(normalizeInvitationId(invitationId));
  return serializeRevokedInvitations(current);
}

export function removeRevokedInvitation(
  raw: string | undefined | null,
  invitationId: string,
): string {
  const normalized = normalizeInvitationId(invitationId);
  return serializeRevokedInvitations(
    parseRevokedInvitations(raw).filter((entry) => entry !== normalized),
  );
}
