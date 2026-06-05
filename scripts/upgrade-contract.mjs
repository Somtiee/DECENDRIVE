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
const PUBLISHED_PATH = resolve(CONTRACTS_PATH, "Published.toml");
const SUI_BIN = resolve(ROOT, ".sui-cli", "sui.exe");

const UPGRADE_POLICY_COMPATIBLE = 0;

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

function loadDeployerKeypair() {
  const secret = process.env.SUI_DEPLOYER_PRIVATE_KEY?.trim();
  if (!secret) {
    throw new Error("Missing SUI_DEPLOYER_PRIVATE_KEY");
  }
  if (secret.startsWith("suiprivkey")) {
    const { secretKey } = decodeSuiPrivateKey(secret);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const hex = secret.startsWith("0x") ? secret.slice(2) : secret;
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, "hex")));
}

function updateEnvPackageId(packageId) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=${packageId}`;
  const updated = raw.includes("NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=")
    ? raw.replace(/^NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=.*$/m, line)
    : `${raw.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
}

function readPublishedMainnet() {
  const raw = readFileSync(PUBLISHED_PATH, "utf8");
  const publishedAt = raw.match(/^published-at\s*=\s*"(0x[a-f0-9]+)"/m)?.[1];
  const upgradeCap = raw.match(/^upgrade-capability\s*=\s*"(0x[a-f0-9]+)"/m)?.[1];
  if (!upgradeCap) {
    throw new Error("Published.toml is missing mainnet upgrade-capability.");
  }
  return { publishedAt, upgradeCap };
}

function updatePublishedPackageId(packageId) {
  const raw = readFileSync(PUBLISHED_PATH, "utf8");
  const updated = raw.replace(/^published-at\s*=\s*".*"$/m, `published-at = "${packageId}"`);
  writeFileSync(PUBLISHED_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
}

async function resolveCurrentPackageId(client, upgradeCap) {
  const capObject = await client.getObject({
    id: upgradeCap,
    options: { showContent: true },
  });
  const packageId = capObject.data?.content?.fields?.package;
  if (typeof packageId !== "string" || !packageId.startsWith("0x")) {
    throw new Error("UpgradeCap.package is not readable on-chain.");
  }
  return packageId;
}

async function main() {
  loadEnvFile();
  const { publishedAt, upgradeCap } = readPublishedMainnet();
  const keypair = loadDeployerKeypair();
  const sender = keypair.toSuiAddress();

  const pubfile = resolve(CONTRACTS_PATH, "ephemeral.pub");
  const buildOutput = execSync(
    `"${SUI_BIN}" move build --dump-bytecode-as-base64 --path "${CONTRACTS_PATH}" --build-env mainnet --pubfile-path "${pubfile}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const { modules, dependencies, digest } = JSON.parse(buildOutput);
  if (!digest || digest.length !== 32) {
    throw new Error("Move build did not return a valid 32-byte package digest.");
  }
  const digestBytes = Uint8Array.from(digest);

  const apiKey = process.env.TATUM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing TATUM_API_KEY");
  }

  // Tatum is used for app reads; package upgrade uses the public fullnode because
  // signAndExecute requires suix_getLatestSuiSystemState (not on Tatum gateway).
  const client = new SuiJsonRpcClient({
    network: "mainnet",
    transport: new JsonRpcHTTPTransport({
      url: "https://fullnode.mainnet.sui.io:443",
    }),
  });

  const balance = await client.getBalance({ owner: sender });
  const mist = BigInt(balance.totalBalance);
  const minMist = 25_000_000n;
  if (mist < minMist) {
    throw new Error(
      `Deployer ${sender} needs ~0.03 SUI for a package upgrade. Balance: ${balance.totalBalance} MIST (~${(Number(mist) / 1e9).toFixed(4)} SUI). Send SUI to the deployer wallet, then rerun npm run upgrade:contract.`,
    );
  }

  const packageId = await resolveCurrentPackageId(client, upgradeCap);
  if (publishedAt && publishedAt !== packageId) {
    console.log(`Using on-chain package ${packageId} (Published.toml had ${publishedAt}).`);
  }

  const tx = new Transaction();
  const cap = tx.object(upgradeCap);
  const digestArg = tx.pure.vector("u8", digestBytes);
  const ticket = tx.moveCall({
    target: "0x2::package::authorize_upgrade",
    arguments: [cap, tx.pure.u8(UPGRADE_POLICY_COMPATIBLE), digestArg],
  });

  const receipt = tx.upgrade({
    modules,
    dependencies,
    package: packageId,
    ticket,
  });

  tx.moveCall({
    target: "0x2::package::commit_upgrade",
    arguments: [cap, receipt],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  const capObject = await client.getObject({
    id: upgradeCap,
    options: { showContent: true },
  });
  const latestPackageId = capObject.data?.content?.fields?.package;
  if (typeof latestPackageId !== "string" || !latestPackageId.startsWith("0x")) {
    throw new Error("Upgrade succeeded but UpgradeCap.package was not readable.");
  }

  updateEnvPackageId(latestPackageId);
  updatePublishedPackageId(latestPackageId);

  console.log(`Upgraded DecenDrive package: ${latestPackageId}`);
  console.log(`Transaction digest: ${result.digest}`);
  console.log(`Updated ${ENV_PATH} and ${PUBLISHED_PATH}`);
  console.log("DriveProfile + FileRegisteredEvent are on this package when present in the build.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
