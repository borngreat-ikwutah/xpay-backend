import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { supabase } from "../lib/supabase";
import { Client as XpayGuardClient, networks } from "../lib/xpay-guard/src";

type MerchantWhitelistRow = {
  active?: boolean | null;
};

type TransactionInsert = {
  tx_hash?: string | null;
  status: string;
  type?: string | null;
  from_address?: string | null;
  merchant_address?: string | null;
  amount?: string | number | null;
  token?: string | null;
  contract_id?: string | null;
  raw_response?: unknown;
  metadata?: unknown;
  created_at?: string;
  updated_at?: string;
};

export type ProcessTipInput = {
  merchantAddress: string;
  amount: string | number;
  txHash?: string;
  memo?: string;
  token?: string;
  userAddress?: string;
};

export type ProcessTipResult = {
  success: boolean;
  txHash: string;
  contractId: string;
  merchantAddress: string;
  amount: string;
  submissionHash: string | null;
  result?: unknown;
};

export type InitSessionInput = {
  userAddress: string;
  token: string;
  escrowAmount: string | number;
  limit: string | number;
  period: number;
  deadline: number;
};

export type InitSessionResult = {
  success: boolean;
  contractId: string;
  userAddress: string;
  token: string;
  escrowAmount: string;
  limit: string;
  period: number;
  deadline: number;
  submissionHash: string | null;
  result?: unknown;
};

export type ClaimRefundInput = {
  userAddress: string;
  txHash?: string;
};

export type ClaimRefundResult = {
  success: boolean;
  contractId: string;
  userAddress: string;
  txHash: string;
  submissionHash: string | null;
  result?: unknown;
};

export type PaymentRequiredResult = {
  success: false;
  status: 402;
  error: string;
  message: string;
};

const DEFAULT_CONTRACT_ID =
  "CDMTECKTTLNFWDZBVVWV4JRLWWYOYJA5RMTTM75FG5UVXDHPNM6NO5OW";

const DEFAULT_TOKEN = "XLM";

function normalizeAmount(amount: string | number): string {
  const value = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!value) throw new Error("Amount is required");

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Amount must be a positive number");
  }

  return parsed.toString();
}

function normalizeAddress(address: string): string {
  const value = address.trim();
  if (!/^G[A-Z2-7]{55}$/.test(value)) {
    throw new Error("Invalid Stellar public key");
  }
  return value;
}

async function isMerchantWhitelisted(merchantAddress: string) {
  const { data, error } = await supabase
    .from("merchant_whitelist")
    .select("active")
    .eq("merchant_address", merchantAddress)
    .maybeSingle<MerchantWhitelistRow>();

  if (error) {
    throw new Error(`Failed to check merchant whitelist: ${error.message}`);
  }

  return Boolean(
    data &&
    (data.active === true || data.active === null || data.active === undefined),
  );
}

async function logTransaction(entry: TransactionInsert) {
  const payload = {
    ...entry,
    created_at: entry.created_at ?? new Date().toISOString(),
    updated_at: entry.updated_at ?? new Date().toISOString(),
  };

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) {
    throw new Error(`Failed to write transaction log: ${error.message}`);
  }
}

async function getStellarInvocationClient() {
  const rpcUrl =
    process.env.STELLAR_RPC_URL ??
    process.env.SOROBAN_RPC_URL ??
    "https://soroban-testnet.stellar.org";

  const contractId =
    process.env.XPAY_GUARD_CONTRACT_ID ??
    networks.testnet.contractId ??
    DEFAULT_CONTRACT_ID;

  const agentSecretKey = process.env.AGENT_SECRET_KEY;

  if (!agentSecretKey) {
    throw new Error("Missing AGENT_SECRET_KEY");
  }

  const agentKeypair = Keypair.fromSecret(agentSecretKey);
  const agentPublicKey = agentKeypair.publicKey();

  const signTransaction = async (xdr: string) => {
    return {
      signedTxXdr: xdr,
      signerAddress: agentPublicKey,
    };
  };

  const signAuthEntry = async (authEntry: string) => {
    return {
      signedAuthEntry: authEntry,
      signerAddress: agentPublicKey,
    };
  };

  const client = new XpayGuardClient({
    contractId,
    rpcUrl,
    networkPassphrase: networks.testnet.networkPassphrase,
    publicKey: agentPublicKey,
    signTransaction,
    signAuthEntry,
  });

  return { client, rpcUrl, contractId, agentSecretKey, agentPublicKey };
}

async function submitAssembledTransaction<T>(assembled: {
  signAndSend: (opts?: {
    force?: boolean;
    signTransaction?: unknown;
    watcher?: unknown;
  }) => Promise<{ result: T; hash?: string }>;
  result: T;
}) {
  const sent = await assembled.signAndSend({
    force: true,
  });

  return {
    hash: sent.hash ?? null,
    result: sent.result ?? assembled.result,
  };
}

async function invokePayService(params: {
  amount: string;
  merchantAddress: string;
  memo?: string;
  txHash: string;
  userAddress: string;
}) {
  const { client, rpcUrl, contractId, agentPublicKey } =
    await getStellarInvocationClient();

  const assembled = await client.pay_service(
    {
      agent: agentPublicKey,
      user: params.userAddress,
      destination: params.merchantAddress,
      amount: BigInt(params.amount),
    },
    {
      fee: "auto",
      timeoutInSeconds: 60,
    },
  );

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    merchantAddress: params.merchantAddress,
    amount: params.amount,
    memo: params.memo ?? null,
    txHash: params.txHash,
    rpcUrl,
    hash: submitted.hash,
  };
}

async function invokeInitSession(params: {
  userAddress: string;
  token: string;
  escrowAmount: string;
  limit: string;
  period: number;
  deadline: number;
}) {
  const { client, rpcUrl, contractId, agentPublicKey } =
    await getStellarInvocationClient();

  const assembled = await client.init_session(
    {
      user: params.userAddress,
      agent: agentPublicKey,
      token: params.token,
      escrow_amount: BigInt(params.escrowAmount),
      limit: BigInt(params.limit),
      period: BigInt(params.period),
      deadline: BigInt(params.deadline),
    },
    {
      fee: "auto",
      timeoutInSeconds: 60,
    },
  );

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    rpcUrl,
    hash: submitted.hash,
  };
}

async function invokeClaimRefund(params: {
  userAddress: string;
  txHash: string;
}) {
  const { client, rpcUrl, contractId, agentPublicKey } =
    await getStellarInvocationClient();

  const assembled = await client.claim_refund(
    {
      user: params.userAddress,
      agent: agentPublicKey,
    },
    {
      fee: "auto",
      timeoutInSeconds: 60,
    },
  );

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    rpcUrl,
    txHash: params.txHash,
    hash: submitted.hash,
  };
}

export async function processTip(
  input: ProcessTipInput,
): Promise<ProcessTipResult> {
  const merchantAddress = normalizeAddress(input.merchantAddress);
  const amount = normalizeAmount(input.amount);
  const txHash = input.txHash?.trim() || randomUUID();
  const token = input.token?.trim() || DEFAULT_TOKEN;
  const userAddress = input.userAddress
    ? normalizeAddress(input.userAddress)
    : "";

  const whitelisted = await isMerchantWhitelisted(merchantAddress);
  if (!whitelisted) {
    await logTransaction({
      tx_hash: txHash,
      status: "rejected",
      type: "tip",
      from_address: userAddress || null,
      merchant_address: merchantAddress,
      amount,
      token,
      contract_id: DEFAULT_CONTRACT_ID,
      metadata: {
        reason: "merchant_not_whitelisted",
      },
    });

    throw new Error("Merchant is not whitelisted");
  }

  const invocation = await invokePayService({
    amount,
    merchantAddress,
    memo: input.memo,
    txHash,
    userAddress: userAddress || merchantAddress,
  });

  await logTransaction({
    tx_hash: txHash,
    status: "success",
    type: "tip",
    from_address: userAddress || null,
    merchant_address: merchantAddress,
    amount,
    token,
    contract_id: invocation.contractId,
    raw_response: invocation.result ?? invocation,
    metadata: {
      memo: input.memo ?? null,
      agent_public_key: invocation.operator,
      rpc_url: invocation.rpcUrl,
    },
  });

  return {
    success: true,
    txHash,
    contractId: invocation.contractId,
    merchantAddress,
    amount,
    submissionHash: invocation.hash,
    result: invocation.result ?? invocation,
  };
}

export async function initSession(
  input: InitSessionInput,
): Promise<InitSessionResult> {
  const userAddress = normalizeAddress(input.userAddress);
  const token = input.token.trim();
  const escrowAmount = normalizeAmount(input.escrowAmount);
  const limit = normalizeAmount(input.limit);

  if (!token) {
    throw new Error("Token is required");
  }

  if (!Number.isInteger(input.period) || input.period <= 0) {
    throw new Error("Period must be a positive integer");
  }

  if (!Number.isInteger(input.deadline) || input.deadline <= 0) {
    throw new Error("Deadline must be a positive integer");
  }

  const invocation = await invokeInitSession({
    userAddress,
    token,
    escrowAmount,
    limit,
    period: input.period,
    deadline: input.deadline,
  });

  await logTransaction({
    tx_hash: randomUUID(),
    status: "success",
    type: "init_session",
    from_address: userAddress,
    amount: escrowAmount,
    token,
    contract_id: invocation.contractId,
    raw_response: invocation.result ?? invocation,
    metadata: {
      limit,
      period: input.period,
      deadline: input.deadline,
      agent_public_key: invocation.operator,
      rpc_url: invocation.rpcUrl,
    },
  });

  return {
    success: true,
    contractId: invocation.contractId,
    userAddress,
    token,
    escrowAmount,
    limit,
    period: input.period,
    deadline: input.deadline,
    submissionHash: invocation.hash,
    result: invocation.result ?? invocation,
  };
}

export async function claimRefund(
  input: ClaimRefundInput,
): Promise<ClaimRefundResult> {
  const userAddress = normalizeAddress(input.userAddress);
  const txHash = input.txHash?.trim() || randomUUID();

  const invocation = await invokeClaimRefund({
    userAddress,
    txHash,
  });

  await logTransaction({
    tx_hash: txHash,
    status: "success",
    type: "claim_refund",
    from_address: userAddress,
    contract_id: invocation.contractId,
    raw_response: invocation.result ?? invocation,
    metadata: {
      agent_public_key: invocation.operator,
      rpc_url: invocation.rpcUrl,
    },
  });

  return {
    success: true,
    contractId: invocation.contractId,
    userAddress,
    txHash,
    submissionHash: invocation.hash,
    result: invocation.result ?? invocation,
  };
}

export function x402Required(message = "This endpoint requires payment") {
  return {
    success: false as const,
    status: 402 as const,
    error: "Payment Required" as const,
    message,
  };
}

export const agentService = {
  processTip,
  initSession,
  claimRefund,
  x402Required,
};
