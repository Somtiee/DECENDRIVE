import { AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import { Transaction } from "@mysten/sui/transactions";

import { WAL_COIN_TYPE } from "./wallet";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const SLIPPAGE = 0.01; // 1%
const DEFAULT_BUFFER_BPS = 1200; // 12% routing + price movement buffer
const DEFAULT_WAL_PRICE_IN_SUI = 0.03; // UI estimation fallback only

type BuildSwapPtbParams = {
  requiredWalMist: bigint;
  bufferBps?: number;
  slippage?: number;
};

type BuildSwapPtbResult = {
  txb: Transaction;
  estimatedSuiInMist: bigint;
  expectedWalOutMist: bigint;
};

function asMist(value: string | number | bigint) {
  const mist = BigInt(value);
  if (mist <= 0n) {
    throw new Error("Swap amount must be greater than zero.");
  }
  return mist;
}

function getAggregatorClient() {
  return new AggregatorClient({
    env: Env.Mainnet,
  });
}

export function estimateAutoSwapSui(requiredWal: number) {
  return requiredWal * DEFAULT_WAL_PRICE_IN_SUI;
}

export async function buildSuiToWalSwapTransaction(params: BuildSwapPtbParams): Promise<BuildSwapPtbResult> {
  const client = getAggregatorClient();
  const requiredWalMist = asMist(params.requiredWalMist);
  const bufferBps = params.bufferBps ?? DEFAULT_BUFFER_BPS;
  const slippage = params.slippage ?? SLIPPAGE;

  const routeForExactWal = await client.findRouters({
    from: SUI_COIN_TYPE,
    target: WAL_COIN_TYPE,
    amount: requiredWalMist,
    byAmountIn: false,
  });

  if (!routeForExactWal || routeForExactWal.insufficientLiquidity) {
    throw new Error("Swap route unavailable. Add more SUI and try again.");
  }

  const baseSuiInMist = asMist(routeForExactWal.amountIn.toString());
  const bufferedSuiInMist = (baseSuiInMist * BigInt(10_000 + bufferBps)) / 10_000n + 1n;

  const routeForBufferedSui = await client.findRouters({
    from: SUI_COIN_TYPE,
    target: WAL_COIN_TYPE,
    amount: bufferedSuiInMist,
    byAmountIn: true,
  });

  if (!routeForBufferedSui || routeForBufferedSui.insufficientLiquidity) {
    throw new Error("Swap route unavailable. Add more SUI and try again.");
  }

  const txb = new Transaction();
  await client.fastRouterSwap({
    router: routeForBufferedSui,
    txb,
    slippage,
  });

  return {
    txb,
    estimatedSuiInMist: bufferedSuiInMist,
    expectedWalOutMist: asMist(routeForBufferedSui.amountOut.toString()),
  };
}
