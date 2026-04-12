import { Context } from "hono";
import { sign } from "hono/jwt";
import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";

type VerifyBody = {
  address?: string;
  signedMessage?: string;
  nonce?: string;
};

const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 24 hours
const NONCE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function buildSiwsMessage(address: string, nonce: string) {
  return `xPay wants you to sign in with your Stellar account:
${address}

Nonce: ${nonce}
URI: ${process.env.APP_URL ?? "http://localhost:3000"}
Version: 1
Chain ID: testnet`;
}

async function verifyFreighterSignature(
  address: string,
  signedMessage: string,
  nonce: string,
) {
  const message = buildSiwsMessage(address, nonce);

  // Support multiple Stellar SDK entry points across versions.
  const stellarSdk: any = await import("@stellar/stellar-sdk").catch(
    () => null,
  );
  const signUtils: any = await import("@stellar/stellar-sdk/lib/utils").catch(
    () => null,
  );

  const verifyFn =
    stellarSdk?.verifyMessageSignature ??
    signUtils?.verifyMessageSignature ??
    stellarSdk?.default?.verifyMessageSignature;

  if (typeof verifyFn !== "function") {
    throw new Error("Stellar signature verification utility is unavailable");
  }

  const result = await verifyFn(address, signedMessage, message);
  return Boolean(result);
}

/**
 * GET /auth/nonce?address=G...
 * Generates and stores a short-lived nonce for SIWS.
 */
export const getNonce = async (c: Context) => {
  const address = c.req.query("address")?.trim();

  if (!address) {
    return c.json({ error: "Address is required" }, 400);
  }

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return c.json({ error: "Invalid Stellar public key" }, 400);
  }

  const nonce = randomUUID();
  const expires_at = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await supabase.from("auth_nonces").upsert(
    {
      address,
      nonce,
      expires_at,
    },
    { onConflict: "address" },
  );

  if (error) {
    console.error("Nonce storage failed:", error);
    return c.json({ error: "Unable to generate authentication nonce" }, 500);
  }

  return c.json({
    nonce,
    expires_at,
    message: buildSiwsMessage(address, nonce),
  });
};

/**
 * POST /auth/verify
 * Verifies the Freighter signature, upserts the profile, and issues a JWT.
 */
export const verifySignature = async (c: Context) => {
  const body = (await c.req.json().catch(() => null)) as VerifyBody | null;

  const address = body?.address?.trim();
  const signedMessage = body?.signedMessage?.trim();
  const nonce = body?.nonce?.trim();

  const JWT_SECRET = c.env?.JWT_SECRET;

  if (!JWT_SECRET) {
    return c.json({ error: "Server misconfigured: missing JWT secret" }, 500);
  }

  if (!address || !signedMessage || !nonce) {
    return c.json(
      { error: "address, signedMessage, and nonce are required" },
      400,
    );
  }

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return c.json({ error: "Invalid Stellar public key" }, 400);
  }

  const { data: storedNonce, error: fetchError } = await supabase
    .from("auth_nonces")
    .select("address, nonce, expires_at")
    .eq("address", address)
    .eq("nonce", nonce)
    .maybeSingle();

  if (
    fetchError ||
    !storedNonce ||
    new Date(storedNonce.expires_at) < new Date()
  ) {
    return c.json({ error: "Auth session expired. Please retry." }, 401);
  }

  let isValid = false;
  try {
    isValid = await verifyFreighterSignature(address, signedMessage, nonce);
  } catch (error) {
    console.error("Signature verification error:", error);
    return c.json({ error: "Cryptographic verification failed" }, 401);
  }

  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const now = new Date().toISOString();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        wallet_address: address,
        updated_at: now,
        onboarding_complete: true,
      },
      { onConflict: "wallet_address" },
    )
    .select("*")
    .single();

  if (profileError || !profile) {
    console.error("Profile sync failed:", profileError);
    return c.json({ error: "User profile synchronization failed" }, 500);
  }

  const payload = {
    sub: String(profile.id),
    address: profile.wallet_address,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN_SECONDS,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload, JWT_SECRET);

  await supabase
    .from("auth_nonces")
    .delete()
    .eq("address", address)
    .eq("nonce", nonce);

  return c.json({
    success: true,
    token,
    user: {
      id: profile.id,
      address: profile.wallet_address,
      username: profile.username ?? null,
      onboarding_complete: profile.onboarding_complete ?? true,
    },
  });
};
