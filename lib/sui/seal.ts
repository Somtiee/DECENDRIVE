type SealEncryptionResult = {
  ciphertext: Uint8Array;
  keyId: string;
};

export async function encryptWithSeal(plainTextBytes: Uint8Array) {
  const sealModule = (await import("@mysten/seal")) as Record<string, unknown>;
  const encrypt = sealModule["encrypt"] as
    | ((data: Uint8Array) => Promise<SealEncryptionResult>)
    | undefined;

  if (!encrypt) {
    throw new Error("Seal encryption integration is not available.");
  }

  return encrypt(plainTextBytes);
}
