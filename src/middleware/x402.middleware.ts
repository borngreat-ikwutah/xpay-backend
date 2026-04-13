import type { Context, Next } from "hono";

type PaymentRequiredChallenge = {
  success: false;
  status: 402;
  error: "Payment Required";
  message: string;
  payment: {
    network: "testnet" | "mainnet";
    destination: string;
    asset: {
      code: string;
      issuer?: string;
    };
    amount: string;
    memo?: string;
    contractId?: string;
  };
  required?: {
    txHash?: boolean;
    amount?: boolean;
    merchantAddress?: boolean;
  };
};

function getEnvValue(c: Context, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = c.env?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function buildChallengeBody(
  c: Context,
  message: string,
  required?: PaymentRequiredChallenge["required"],
): PaymentRequiredChallenge {
  const network = (c.env?.STELLAR_NETWORK ?? "testnet") as
    | "testnet"
    | "mainnet";

  const destination = getEnvValue(
    c,
    ["X402_PAYMENT_DESTINATION", "STELLAR_PAYMENT_DESTINATION"],
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  );

  const assetCode = getEnvValue(
    c,
    ["X402_ASSET_CODE", "STELLAR_ASSET_CODE"],
    "XLM",
  );

  const assetIssuer =
    assetCode.toUpperCase() === "XLM"
      ? undefined
      : getEnvValue(c, ["X402_ASSET_ISSUER", "STELLAR_ASSET_ISSUER"], "") ||
        undefined;

  const amount = getEnvValue(
    c,
    ["X402_PRICE", "STELLAR_PRICE", "X402_AMOUNT"],
    "0.1",
  );

  const memo = getEnvValue(c, ["X402_MEMO", "STELLAR_MEMO"], "") || undefined;

  const contractId =
    getEnvValue(c, ["XPAY_GUARD_CONTRACT_ID"], "") || undefined;

  return {
    success: false,
    status: 402,
    error: "Payment Required",
    message,
    payment: {
      network,
      destination,
      asset: {
        code: assetCode,
        ...(assetIssuer ? { issuer: assetIssuer } : {}),
      },
      amount,
      ...(memo ? { memo } : {}),
      ...(contractId ? { contractId } : {}),
    },
    ...(required ? { required } : {}),
  };
}

export function x402Required(
  c: Context,
  message = "This endpoint requires payment",
  required?: PaymentRequiredChallenge["required"],
) {
  return buildChallengeBody(c, message, required);
}

export async function x402Guard(c: Context, next: Next) {
  const body = (await c.req.json().catch(() => null)) as {
    txHash?: string;
  } | null;

  if (!body?.txHash) {
    const challenge = x402Required(
      c,
      "This endpoint requires a valid transaction hash.",
      {
        txHash: true,
      },
    );

    // Add protocol-specific headers for agentic compliance
    c.header("X-Stellar-Destination", challenge.payment.destination);
    c.header("X-Stellar-Asset", challenge.payment.asset.code);
    c.header("X-Stellar-Amount", challenge.payment.amount);
    if (challenge.payment.contractId) {
      c.header("X-Stellar-Contract", challenge.payment.contractId);
    }

    return c.json(challenge, 402);
  }

  await next();
}
