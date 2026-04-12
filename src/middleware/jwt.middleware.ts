import type { Context, Next } from "hono";
import { verify } from "hono/jwt";

type JwtPayload = {
  sub?: string;
  address?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
};

function getBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token) return null;

  if (scheme.toLowerCase() !== "bearer") return null;

  return token.trim() || null;
}

export async function jwtGuard(c: Context, next: Next) {
  const authHeader =
    c.req.header("authorization") ?? c.req.header("Authorization");
  const token = getBearerToken(authHeader);

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: "Server misconfigured: missing JWT secret" }, 500);
  }

  try {
    const payload = (await verify(token, secret, "HS256")) as JwtPayload;

    if (!payload?.sub) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("jwtPayload", payload);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
}

declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
  }
}
