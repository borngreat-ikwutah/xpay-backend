import type { Context, Next } from "hono";

type PaymentRequiredBody = {
  success: false;
  status: 402;
  error: "Payment Required";
  message: string;
  required?: {
    txHash?: boolean;
    amount?: boolean;
    merchantAddress?: boolean;
  };
};

export function x402Required(
  message = "This endpoint requires payment",
  required?: PaymentRequiredBody["required"],
) {
  return {
    success: false as const,
    status: 402 as const,
    error: "Payment Required" as const,
    message,
    ...(required ? { required } : {}),
  };
}

export async function x402Guard(c: Context, next: Next) {
  const body = await c.req.json().catch(() => null);

  if (!body?.txHash) {
    return c.json(
      x402Required("This endpoint requires a valid transaction hash.", {
        txHash: true,
      }),
      402,
    );
  }

  await next();
}
