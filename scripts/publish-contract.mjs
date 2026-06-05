import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";

const ROOT = resolve(import.meta.dirname, "..");
const CONTRACTS_PATH = resolve(ROOT, "contracts");
const ENV_PATH = resolve(ROOT, ".env");
const SUI_BIN = resolve(ROOT, ".sui-cli", "sui.exe");

function loadEnvFile() {
  const raw = readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getDeployerKeypair() {
  const secret = process.env.SUI_DEPLOYER_PRIVATE_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Missing SUI_DEPLOYER_PRIVATE_KEY in .env. Export your Sui wallet private key (suiprivkey...) and retry.",
    );
  }

  if (secret.startsWith("suiprivkey")) {
    const { secretKey } = decodeSuiPrivateKey(secret);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  const hex = secret.startsWith("0x") ? secret.slice(2) : secret;
  const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
  return Ed25519Keypair.fromSecretKey(bytes);
}

function updateEnvPackageId(packageId) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=${packageId}`;
  const updated = raw.includes("NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=")
    ? raw.replace(/^NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=.*$/m, line)
    : `${raw.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
}

function extractPackageId(result) {
  const objectChanges = result.objectChanges ?? [];
  for (const change of objectChanges) {
    if (change.type === "published") {
      return change.packageId;
    }
  }

  const effects = result.effects?.created ?? [];
  for (const created of effects) {
    const type = created.owner?.Immutable ?? created.reference?.objectType;
    if (typeof type === "string" && type.includes("package::")) {
      return created.reference?.objectId;
    }
  }

  throw new Error("Publish succeeded but packageId was not found in transaction effects.");
}

async function main() {
  loadEnvFile();

  const publishedPath = resolve(CONTRACTS_PATH, "Published.toml");
  try {
    const published = readFileSync(publishedPath, "utf8");
    if (published.includes("upgrade-capability")) {
      console.log("Package already published on mainnet. Running upgrade instead…");
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "upgrade-contract.mjs")], {
        stdio: "inherit",
        env: process.env,
      });
      process.exit(result.status ?? 1);
    }
  } catch {
    // No Published.toml — proceed with first-time publish.
  }

  const keypair = getDeployerKeypair();
  const sender = keypair.toSuiAddress();

  const pubfile = resolve(CONTRACTS_PATH, "ephemeral.pub");
  const buildOutput = execSync(
    `"${SUI_BIN}" move build --dump-bytecode-as-base64 --path "${CONTRACTS_PATH}" --build-env mainnet --pubfile-path "${pubfile}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const { modules, dependencies } = JSON.parse(buildOutput);

  const apiKey = process.env.TATUM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing TATUM_API_KEY in .env");
  }

  const client = new SuiJsonRpcClient({
    network: "mainnet",
    transport: new JsonRpcHTTPTransport({
      url: "https://sui-mainnet.gateway.tatum.io",
      headers: { "x-api-key": apiKey },
    }),
  });

  const balance = await client.getBalance({ owner: sender });
  if (BigInt(balance.totalBalance) < 200_000_000n) {
    throw new Error(
      `Deployer ${sender} needs at least 0.2 SUI for gas. Current balance: ${balance.totalBalance} MIST.`,
    );
  }

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], sender);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  const packageId = extractPackageId(result);
  updateEnvPackageId(packageId);

  console.log(`Published DecenDrive package: ${packageId}`);
  console.log(`Transaction digest: ${result.digest}`);
  console.log(`Updated ${ENV_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
