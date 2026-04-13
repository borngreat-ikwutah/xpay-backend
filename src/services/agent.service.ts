import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { getSupabase } from "../lib/supabase";
import { Client as XpayGuardClient, networks } from "../lib/xpay-guard/src";
import { Bindings } from "../types/env";

type MerchantWhitelistRow = {
  active?: boolean | null;
  merchant_name?: string | null;
};

type AgentRow = {
  id?: string | number | null;
  wallet_address?: string | null;
  spent_xlm?: string | number | null;
  spent_usdc?: string | number | null;
};

type TransactionInsert = {
  tx_hash?: string | null;
  status: string;
  type?: string | null;
  from_address?: string | null;
  merchant_address?: string | null;
  merchant_name?: string | null;
  amount?: string | number | null;
  token?: string | null;
  contract_id?: string | null;
  raw_response?: unknown;
  metadata?: unknown;
  created_at?: string;
  updated_at?: string;
};

export type XPayErrorCode =
  | "MERCHANT_NOT_WHITELISTED"
  | "LIMIT_EXCEEDED"
  | "INSUFFICIENT_ESCROW"
  | "INVALID_SIGNATURE"
  | "SERVER_MISCONFIGURED"
  | "DB_ERROR"
  | "CONTRACT_ERROR"
  | "PAYMENT_REQUIRED"
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "INVALID_TOKEN";

export class XPayError extends Error {
  constructor(
    public code: XPayErrorCode,
    message: string,
    public status: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "XPayError";
  }
}

export type ProcessTipInput = {
  merchantAddress: string;
  amount: string | number;
  txHash?: string;
  memo?: string;
  token?: string;
  userAddress?: string;
};

export type ProcessTipResult = {
  success: true;
  txHash: string;
  contractId: string;
  merchantAddress: string;
  merchantName: string | null;
  amount: string;
  token: string;
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
  success: true;
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
  success: true;
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
  required?: {
    txHash?: boolean;
    amount?: boolean;
    merchantAddress?: boolean;
  };
  details?: unknown;
};

const DEFAULT_CONTRACT_ID =
  "CDMTECKTTLNFWDZBVVWV4JRLWWYOYJA5RMTTM75FG5UVXDHPNM6NO5OW";

const DEFAULT_TOKEN = "XLM";

function normalizeAmount(amount: string | number): string {
  const value = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!value) {
    throw new XPayError("INVALID_AMOUNT", "Amount is required", 400);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new XPayError(
      "INVALID_AMOUNT",
      "Amount must be a positive number",
      400,
    );
  }

  return parsed.toString();
}

function normalizeAddress(address: string): string {
  const value = address.trim();
  if (!/^G[A-Z2-7]{55}$/.test(value)) {
    throw new XPayError("INVALID_ADDRESS", "Invalid Stellar public key", 400);
  }
  return value;
}

function normalizeToken(token?: string): string {
  const value = token?.trim() || DEFAULT_TOKEN;
  if (!value) {
    throw new XPayError("INVALID_TOKEN", "Token is required", 400);
  }
  return value.toUpperCase();
}

async function isMerchantWhitelisted(env: Bindings, merchantAddress: string) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("merchant_whitelist")
    .select("active, merchant_name")
    .eq("merchant_address", merchantAddress)
    .maybeSingle<MerchantWhitelistRow>();

  if (error) {
    throw new XPayError("DB_ERROR", "Failed to check merchant whitelist", 500, {
      cause: error.message,
    });
  }

  return {
    whitelisted: Boolean(
      data &&
      (data.active === true ||
        data.active === null ||
        data.active === undefined),
    ),
    merchantName: data?.merchant_name ?? null,
  };
}

async function logTransaction(env: Bindings, entry: TransactionInsert) {
  const supabase = getSupabase(env);
  const payload = {
    ...entry,
    created_at: entry.created_at ?? new Date().toISOString(),
    updated_at: entry.updated_at ?? new Date().toISOString(),
  };

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) {
    throw new XPayError("DB_ERROR", "Failed to write transaction log", 500, {
      cause: error.message,
    });
  }
}

async function incrementAgentSpend(
  env: Bindings,
  params: {
    userAddress: string;
    amount: string;
    token: string;
  },
) {
  const supabase = getSupabase(env);
  const spendColumn = params.token === "USDC" ? "spent_usdc" : "spent_xlm";

  const { data, error: fetchError } = await supabase
    .from("agents")
    .select("id, wallet_address, spent_xlm, spent_usdc")
    .eq("wallet_address", params.userAddress)
    .maybeSingle<AgentRow>();

  if (fetchError) {
    throw new XPayError("DB_ERROR", "Failed to fetch agent spend record", 500, {
      cause: fetchError.message,
    });
  }

  const currentSpentRaw = data?.[spendColumn as keyof AgentRow] ?? 0;
  const currentSpent = Number(currentSpentRaw);
  const nextSpent =
    (Number.isFinite(currentSpent) ? currentSpent : 0) + Number(params.amount);

  const { error: updateError } = await supabase
    .from("agents")
    .update({
      [spendColumn]: nextSpent.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq("wallet_address", params.userAddress);

  if (updateError) {
    throw new XPayError("DB_ERROR", "Failed to update agent spend total", 500, {
      cause: updateError.message,
    });
  }
}

async function getStellarInvocationClient(env: Bindings) {
  const contractId =
    env.XPAY_GUARD_CONTRACT_ID ||
    networks.testnet.contractId ||
    DEFAULT_CONTRACT_ID;

  const agentSecretKey = env.AGENT_SECRET_KEY;
  if (!agentSecretKey) {
    throw new XPayError(
      "SERVER_MISCONFIGURED",
      "Missing AGENT_SECRET_KEY",
      500,
    );
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
    publicKey: agentPublicKey,
    networkPassphrase: networks.testnet.networkPassphrase,
    signTransaction,
    signAuthEntry,
  } as unknown as ConstructorParameters<typeof XpayGuardClient>[0]);

  return { client, contractId, agentPublicKey };
}

type LooseAssembledTransaction = {
  signAndSend: (opts?: unknown) => Promise<{ result: unknown; hash?: string }>;
  result: unknown;
};

async function submitAssembledTransaction<T>(
  assembled: LooseAssembledTransaction,
) {
  try {
    const sent = await assembled.signAndSend({ force: true } as never);

    return {
      hash: sent.hash ?? null,
      result: (sent.result ?? assembled.result) as T,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contract error";

    if (/LimitExceeded/i.test(message)) {
      throw new XPayError("LIMIT_EXCEEDED", "Daily limit exceeded", 409, {
        raw: message,
      });
    }

    if (/Insufficient/i.test(message)) {
      throw new XPayError("INSUFFICIENT_ESCROW", "Insufficient escrow", 402, {
        raw: message,
      });
    }

    throw new XPayError("CONTRACT_ERROR", "Soroban transaction failed", 400, {
      raw: message,
    });
  }
}

async function invokePayService(
  env: Bindings,
  params: {
    amount: string;
    merchantAddress: string;
    memo?: string;
    txHash: string;
    userAddress: string;
  },
) {
  const { client, contractId, agentPublicKey } =
    await getStellarInvocationClient(env);

  const assembled = (await client.pay_service(
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
  )) as unknown as LooseAssembledTransaction;

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    merchantAddress: params.merchantAddress,
    amount: params.amount,
    memo: params.memo ?? null,
    txHash: params.txHash,
    hash: submitted.hash,
  };
}

async function invokeInitSession(
  env: Bindings,
  params: {
    userAddress: string;
    token: string;
    escrowAmount: string;
    limit: string;
    period: number;
    deadline: number;
  },
) {
  const { client, contractId, agentPublicKey } =
    await getStellarInvocationClient(env);

  const assembled = (await client.init_session(
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
  )) as unknown as LooseAssembledTransaction;

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    hash: submitted.hash,
  };
}

async function invokeClaimRefund(
  env: Bindings,
  params: {
    userAddress: string;
    txHash: string;
  },
) {
  const { client, contractId, agentPublicKey } =
    await getStellarInvocationClient(env);

  const assembled = (await client.claim_refund(
    {
      user: params.userAddress,
      agent: agentPublicKey,
    },
    {
      fee: "auto",
      timeoutInSeconds: 60,
    },
  )) as unknown as LooseAssembledTransaction;

  const submitted = await submitAssembledTransaction(assembled);

  return {
    result: submitted.result,
    contractId,
    operator: agentPublicKey,
    txHash: params.txHash,
    hash: submitted.hash,
  };
}

function mapErrorToXPayError(error: unknown): XPayError {
  if (error instanceof XPayError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unexpected failure";

  if (/LimitExceeded/i.test(message)) {
    return new XPayError("LIMIT_EXCEEDED", "Daily limit exceeded", 409, {
      raw: message,
    });
  }

  if (/Insufficient/i.test(message)) {
    return new XPayError("INSUFFICIENT_ESCROW", "Insufficient escrow", 402, {
      raw: message,
    });
  }

  if (/whitelist/i.test(message)) {
    return new XPayError(
      "MERCHANT_NOT_WHITELISTED",
      "Merchant is not whitelisted",
      403,
      { raw: message },
    );
  }

  return new XPayError("CONTRACT_ERROR", message, 400);
}

export async function processTip(
  env: Bindings,
  input: ProcessTipInput,
): Promise<ProcessTipResult> {
  try {
    const merchantAddress = normalizeAddress(input.merchantAddress);
    const amount = normalizeAmount(input.amount);
    const txHash = input.txHash?.trim() || randomUUID();
    const token = normalizeToken(input.token);
    const userAddress = input.userAddress
      ? normalizeAddress(input.userAddress)
      : "";

    const { whitelisted, merchantName } = await isMerchantWhitelisted(
      env,
      merchantAddress,
    );

    if (!whitelisted) {
      await logTransaction(env, {
        tx_hash: txHash,
        status: "rejected",
        type: "tip",
        from_address: userAddress || null,
        merchant_address: merchantAddress,
        merchant_name: merchantName,
        amount,
        token,
        contract_id: DEFAULT_CONTRACT_ID,
        metadata: {
          reason: "merchant_not_whitelisted",
        },
      });

      throw new XPayError(
        "MERCHANT_NOT_WHITELISTED",
        "Merchant is not whitelisted",
        403,
      );
    }

    const invocation = await invokePayService(env, {
      amount,
      merchantAddress,
      memo: input.memo,
      txHash,
      userAddress: userAddress || merchantAddress,
    });

    await logTransaction(env, {
      tx_hash: txHash,
      status: "success",
      type: "tip",
      from_address: userAddress || null,
      merchant_address: merchantAddress,
      merchant_name: merchantName,
      amount,
      token,
      contract_id: invocation.contractId,
      raw_response: invocation.result ?? invocation,
      metadata: {
        memo: input.memo ?? null,
        agent_public_key: invocation.operator,
      },
    });

    if (userAddress) {
      await incrementAgentSpend(env, {
        userAddress,
        amount,
        token,
      });
    }

    return {
      success: true,
      txHash,
      contractId: invocation.contractId,
      merchantAddress,
      merchantName,
      amount,
      token,
      submissionHash: invocation.hash,
      result: invocation.result ?? invocation,
    };
  } catch (error) {
    const xpayError = mapErrorToXPayError(error);

    // Ensure failures are also logged to the database for auditability
    try {
      // Re-normalize parameters for logging in case error happened late
      const merchantAddress = normalizeAddress(input.merchantAddress);
      const amount = normalizeAmount(input.amount);
      const txHash = input.txHash?.trim() || "failed-" + randomUUID();
      const token = normalizeToken(input.token);

      await logTransaction(env, {
        tx_hash: txHash,
        status: "failed",
        type: "tip",
        from_address: input.userAddress || null,
        merchant_address: merchantAddress,
        amount,
        token,
        contract_id: DEFAULT_CONTRACT_ID,
        metadata: {
          error_code: xpayError.code,
          error_message: xpayError.message,
          raw_error: error instanceof Error ? error.message : String(error),
        },
      }).catch((e) =>
        console.error("Double failure: could not log failed tip:", e),
      );
    } catch (logInitError) {
      console.error("Could not initialize log for failed tip:", logInitError);
    }

    throw xpayError;
  }
}

export async function initSession(
  env: Bindings,
  input: InitSessionInput,
): Promise<InitSessionResult> {
  try {
    const userAddress = normalizeAddress(input.userAddress);
    const token = normalizeToken(input.token);
    const escrowAmount = normalizeAmount(input.escrowAmount);
    const limit = normalizeAmount(input.limit);

    if (!Number.isInteger(input.period) || input.period <= 0) {
      throw new XPayError(
        "CONTRACT_ERROR",
        "Period must be a positive integer",
        400,
      );
    }

    if (!Number.isInteger(input.deadline) || input.deadline <= 0) {
      throw new XPayError(
        "CONTRACT_ERROR",
        "Deadline must be a positive integer",
        400,
      );
    }

    const invocation = await invokeInitSession(env, {
      userAddress,
      token,
      escrowAmount,
      limit,
      period: input.period,
      deadline: input.deadline,
    });

    await logTransaction(env, {
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
  } catch (error) {
    throw mapErrorToXPayError(error);
  }
}

export async function claimRefund(
  env: Bindings,
  input: ClaimRefundInput,
): Promise<ClaimRefundResult> {
  try {
    const userAddress = normalizeAddress(input.userAddress);
    const txHash = input.txHash?.trim() || randomUUID();

    const invocation = await invokeClaimRefund(env, {
      userAddress,
      txHash,
    });

    await logTransaction(env, {
      tx_hash: txHash,
      status: "success",
      type: "claim_refund",
      from_address: userAddress,
      contract_id: invocation.contractId,
      raw_response: invocation.result ?? invocation,
      metadata: {
        agent_public_key: invocation.operator,
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
  } catch (error) {
    throw mapErrorToXPayError(error);
  }
}

export function x402Required(
  message = "This endpoint requires payment",
  required?: PaymentRequiredResult["required"],
) {
  return {
    success: false as const,
    status: 402 as const,
    error: "Payment Required" as const,
    message,
    ...(required ? { required } : {}),
  };
}

export const agentService = {
  processTip,
  initSession,
  claimRefund,
  x402Required,
};
