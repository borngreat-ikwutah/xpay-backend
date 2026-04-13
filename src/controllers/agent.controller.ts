import type { Context } from "hono";
import {
  claimRefund as claimRefundService,
  initSession as initSessionService,
  processTip,
  XPayError,
} from "../services/agent.service";
import { x402Required } from "../middleware/x402.middleware";

type TipRequestBody = {
  merchantAddress?: string;
  amount?: string | number;
  txHash?: string;
  memo?: string;
  token?: string;
};

type SessionRequestBody = {
  token?: string;
  escrowAmount?: string | number;
  limit?: string | number;
  period?: number;
  deadline?: number;
};

type RefundRequestBody = {
  txHash?: string;
};

type MachineReadableError = {
  success: false;
  error: string;
  message: string;
  details?: unknown;
};

type StatusCode = 400 | 401 | 402 | 403 | 409 | 500;

function getJwtAddress(c: Context): string {
  const payload = c.get("jwtPayload") as
    | {
        address?: unknown;
        wallet_address?: unknown;
      }
    | undefined;

  if (typeof payload?.address === "string") return payload.address;
  if (typeof payload?.wallet_address === "string")
    return payload.wallet_address;
  return "";
}

function jsonError(
  error: string,
  message: string,
  status: StatusCode,
  details?: unknown,
): { body: MachineReadableError; status: StatusCode } {
  const body: MachineReadableError = {
    success: false,
    error,
    message,
    ...(details !== undefined ? { details } : {}),
  };

  return { body, status };
}

function handleXPayError(error: unknown): {
  body: MachineReadableError;
  status: StatusCode;
} {
  if (error instanceof XPayError) {
    return jsonError(
      error.code,
      error.message,
      error.status as StatusCode,
      error.details,
    );
  }

  const message =
    error instanceof Error ? error.message : "Request processing failed";

  return jsonError("CONTRACT_ERROR", message, 400);
}

/**
 * POST /agent/tip
 */
export const tip = async (c: Context) => {
  const body = (await c.req.json().catch(() => null)) as TipRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.txHash) {
    return c.json(
      x402Required(c, "This endpoint requires a valid transaction hash.", {
        txHash: true,
      }),
      402,
    );
  }

  if (!body?.merchantAddress) {
    const err = jsonError("BAD_REQUEST", "merchantAddress is required", 400, {
      field: "merchantAddress",
    });
    return c.json(err.body, err.status);
  }

  if (body.amount === undefined || body.amount === null) {
    const err = jsonError("BAD_REQUEST", "amount is required", 400, {
      field: "amount",
    });
    return c.json(err.body, err.status);
  }

  try {
    const result = await processTip({
      merchantAddress: body.merchantAddress,
      amount: body.amount,
      txHash: body.txHash,
      memo: body.memo,
      token: body.token,
      userAddress,
    });

    return c.json(result, 200);
  } catch (error) {
    const mapped = handleXPayError(error);
    return c.json(mapped.body, mapped.status);
  }
};

/**
 * POST /agent/init-session
 */
export const initSession = async (c: Context) => {
  const body = (await c.req
    .json()
    .catch(() => null)) as SessionRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.token) {
    const err = jsonError("BAD_REQUEST", "token is required", 400, {
      field: "token",
    });
    return c.json(err.body, err.status);
  }

  if (body.escrowAmount === undefined || body.limit === undefined) {
    const err = jsonError(
      "BAD_REQUEST",
      "escrowAmount and limit are required",
      400,
      { fields: ["escrowAmount", "limit"] },
    );
    return c.json(err.body, err.status);
  }

  if (body.period === undefined || body.deadline === undefined) {
    const err = jsonError(
      "BAD_REQUEST",
      "period and deadline are required",
      400,
      { fields: ["period", "deadline"] },
    );
    return c.json(err.body, err.status);
  }

  try {
    const result = await initSessionService({
      userAddress,
      token: body.token,
      escrowAmount: body.escrowAmount,
      limit: body.limit,
      period: body.period,
      deadline: body.deadline,
    });

    return c.json(result, 200);
  } catch (error) {
    const mapped = handleXPayError(error);
    return c.json(mapped.body, mapped.status);
  }
};

/**
 * POST /agent/claim-refund
 */
export const claimRefund = async (c: Context) => {
  const body = (await c.req
    .json()
    .catch(() => null)) as RefundRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.txHash) {
    return c.json(
      x402Required(c, "This endpoint requires a valid transaction hash.", {
        txHash: true,
      }),
      402,
    );
  }

  try {
    const result = await claimRefundService({
      userAddress,
      txHash: body.txHash,
    });

    return c.json(result, 200);
  } catch (error) {
    const mapped = handleXPayError(error);
    return c.json(mapped.body, mapped.status);
  }
};
