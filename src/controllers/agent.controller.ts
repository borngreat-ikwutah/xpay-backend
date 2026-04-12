import type { Context } from "hono";
import {
  claimRefund as claimRefundService,
  initSession as initSessionService,
  processTip,
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

function getJwtAddress(c: Context) {
  const payload = c.get("jwtPayload");
  return payload.address ?? "";
}

export const tip = async (c: Context) => {
  const body = (await c.req.json().catch(() => null)) as TipRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.txHash) {
    return c.json(
      x402Required("This endpoint requires a valid transaction hash.", {
        txHash: true,
      }),
      402,
    );
  }

  if (!body?.merchantAddress) {
    return c.json({ error: "merchantAddress is required" }, 400);
  }

  if (body.amount === undefined || body.amount === null) {
    return c.json({ error: "amount is required" }, 400);
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

    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tip processing failed";

    return c.json({ error: message }, 400);
  }
};

export const initSession = async (c: Context) => {
  const body = (await c.req
    .json()
    .catch(() => null)) as SessionRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.token) {
    return c.json({ error: "token is required" }, 400);
  }

  if (body.escrowAmount === undefined || body.limit === undefined) {
    return c.json({ error: "escrowAmount and limit are required" }, 400);
  }

  if (body.period === undefined || body.deadline === undefined) {
    return c.json({ error: "period and deadline are required" }, 400);
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

    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Session initialization failed";

    return c.json({ error: message }, 400);
  }
};

export const claimRefund = async (c: Context) => {
  const body = (await c.req
    .json()
    .catch(() => null)) as RefundRequestBody | null;
  const userAddress = getJwtAddress(c);

  if (!body?.txHash) {
    return c.json(
      x402Required("This endpoint requires a valid transaction hash.", {
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

    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Refund claim failed";

    return c.json({ error: message }, 400);
  }
};
