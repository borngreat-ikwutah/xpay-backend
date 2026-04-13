// @ts-nocheck

import { Context } from "hono";
import { sign } from "hono/jwt";
import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";

type VerifyBody = {
  address?: string;
  signedMessage?: string;
  nonce?: string;
};

type AuthErrorCode =
  | "AUTH_BAD_REQUEST"
  | "AUTH_INVALID_ADDRESS"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_SIGNATURE_UNAVAILABLE"
  | "AUTH_INVALID_SIGNATURE"
  | "AUTH_PROFILE_SYNC_FAILED"
  | "AUTH_SERVER_MISCONFIGURED";

const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 24 hours
const NONCE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function authError(
  code: AuthErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return {
    status,
    body: {
      success: false as const,
      error: code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function buildSiwsMessage(address: string, nonce: string) {
  return `xPay wants you to sign in with your Stellar account:
${address}

Nonce: ${nonce}
URI: ${process.env.APP_URL ?? "http://localhost:3000"}
Version: 1
Chain ID: testnet`;
}

async function resolveVerifyMessageSignature() {
  const stellarSdk: any = await import("@stellar/stellar-sdk").catch(
    () => null,
  );

  const verifyFn =
    stellarSdk?.verifyMessageSignature ??
    stellarSdk?.default?.verifyMessageSignature;

  if (typeof verifyFn !== "function") {
    throw new Error("Stellar signature verification utility is unavailable");
  }

  return verifyFn as (
    publicKey: string,
    signedMessage: string,
    message: string,
  ) => boolean | Promise<boolean>;
}

async function verifyFreighterSignature(
  address: string,
  signedMessage: string,
  nonce: string,
) {
  const message = buildSiwsMessage(address, nonce);
  const verifyFn = await resolveVerifyMessageSignature();
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
    const err = authError("AUTH_BAD_REQUEST", "Address is required", 400);
    return c.json(err.body, err.status);
  }

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    const err = authError(
      "AUTH_INVALID_ADDRESS",
      "Invalid Stellar public key",
      400,
    );
    return c.json(err.body, err.status);
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
    const err = authError(
      "AUTH_SERVER_MISCONFIGURED",
      "Unable to generate authentication nonce",
      500,
      { cause: error.message },
    );
    return c.json(err.body, err.status);
  }

  return c.json({
    success: true,
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
    const err = authError(
      "AUTH_SERVER_MISCONFIGURED",
      "Server misconfigured: missing JWT secret",
      500,
    );
    return c.json(err.body, err.status);
  }

  if (!address || !signedMessage || !nonce) {
    const err = authError(
      "AUTH_BAD_REQUEST",
      "address, signedMessage, and nonce are required",
      400,
    );
    return c.json(err.body, err.status);
  }

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    const err = authError(
      "AUTH_INVALID_ADDRESS",
      "Invalid Stellar public key",
      400,
    );
    return c.json(err.body, err.status);
  }

  const { data: storedNonce, error: fetchError } = await supabase
    .from("auth_nonces")
    .select("address, nonce, expires_at")
    .eq("address", address)
    .eq("nonce", nonce)
    .maybeSingle();

  if (fetchError) {
    console.error("Nonce lookup failed:", fetchError);
    const err = authError(
      "AUTH_SESSION_EXPIRED",
      "Auth session expired. Please retry.",
      401,
      { cause: fetchError.message },
    );
    return c.json(err.body, err.status);
  }

  if (!storedNonce || new Date(storedNonce.expires_at) < new Date()) {
    const err = authError(
      "AUTH_SESSION_EXPIRED",
      "Auth session expired. Please retry.",
      401,
    );
    return c.json(err.body, err.status);
  }

  // Security Hardening: Consume the nonce immediately to prevent replay attacks.
  // We delete it before verification so it can't be reused even if verification fails.
  await supabase
    .from("auth_nonces")
    .delete()
    .eq("address", address)
    .eq("nonce", nonce);

  let isValid = false;
  try {
    isValid = await verifyFreighterSignature(address, signedMessage, nonce);
  } catch (error) {
    console.error("Signature verification error:", error);
    const err = authError(
      "AUTH_SIGNATURE_UNAVAILABLE",
      "Cryptographic verification failed",
      401,
      { cause: error instanceof Error ? error.message : String(error) },
    );
    return c.json(err.body, err.status);
  }

  if (!isValid) {
    const err = authError("AUTH_INVALID_SIGNATURE", "Invalid signature", 401);
    return c.json(err.body, err.status);
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
    const err = authError(
      "AUTH_PROFILE_SYNC_FAILED",
      "User profile synchronization failed",
      500,
      { cause: profileError?.message ?? "No profile returned" },
    );
    return c.json(err.body, err.status);
  }

  const payload = {
    sub: String(profile.id),
    address: profile.wallet_address,
    wallet_address: profile.wallet_address,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN_SECONDS,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload, JWT_SECRET);

  return c.json({
    success: true,
    token,
    user: {
      id: profile.id,
      address: profile.wallet_address,
      wallet_address: profile.wallet_address,
      username: profile.username ?? null,
      onboarding_complete: profile.onboarding_complete ?? true,
    },
  });
};
