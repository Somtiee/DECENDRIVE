"use client";

import { isBrowser, readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";

const REVOKED_INVITATIONS_KEY = "decendrive:share-revoked-invitations";

function readRevokedInvitationSet(): Record<string, true> {
  return readWalletJson<Record<string, true>>(REVOKED_INVITATIONS_KEY, {});
}

function writeRevokedInvitationSet(set: Record<string, true>) {
  if (!isBrowser()) {
    return;
  }
  writeWalletJson(REVOKED_INVITATIONS_KEY, set);
}

export function isInvitationLocallyRevoked(invitationId: string): boolean {
  if (!invitationId) {
    return false;
  }
  return Boolean(readRevokedInvitationSet()[invitationId.trim().toLowerCase()]);
}

export function addLocalRevokedInvitation(invitationId: string) {
  if (!invitationId) {
    return;
  }
  const set = readRevokedInvitationSet();
  set[invitationId.trim().toLowerCase()] = true;
  writeRevokedInvitationSet(set);
}

export function removeLocalRevokedInvitation(invitationId: string) {
  if (!invitationId) {
    return;
  }
  const set = readRevokedInvitationSet();
  delete set[invitationId.trim().toLowerCase()];
  writeRevokedInvitationSet(set);
}
