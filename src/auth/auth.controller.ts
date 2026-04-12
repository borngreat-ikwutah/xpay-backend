import { Context } from "hono";
import { sign } from "hono/jwt";
import verifyMessageSignature from "@stellar/stellar-sdk";
import { supabase } from "../lib/supabase";

/**
 * GET /auth/nonce?address=G...
 */
export const getNonce = async (c: Context) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "Address is required" }, 400);

  // Use a cryptographically secure random string
  const nonce = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const { error } = await supabase.from("auth_nonces").upsert(
    {
      address,
      nonce,
      expires_at,
    },
    { onConflict: "address" },
  );

  if (error) {
    console.error("Supabase Nonce Error:", error);
    return c.json({ error: "Database handshake failed" }, 500);
  }

  return c.json({ nonce });
};

/**
 * POST /auth/verify
 */
export const verifySignature = async (c: Context) => {
  const { address, signedMessage, nonce } = await c.req.json();
  const JWT_SECRET = c.env.JWT_SECRET; // Ensure this is in your wrangler.toml or .env

  // 1. Single-call validation and immediate cleanup
  const { data: storedNonce, error: fetchError } = await supabase
    .from("auth_nonces")
    .select("*")
    .eq("address", address)
    .eq("nonce", nonce)
    .single();

  if (
    fetchError ||
    !storedNonce ||
    new Date() > new Date(storedNonce.expires_at)
  ) {
    return c.json({ error: "Auth session expired. Please retry." }, 401);
  }

  // 2. Cryptographic Verification
  try {
    // Standard SIWS (Sign-In With Stellar) check
    const isValid = verifyMessageSignature(address, signedMessage, nonce);
    if (!isValid) throw new Error("Invalid signature");
  } catch (err) {
    return c.json({ error: "Cryptographic verification failed" }, 401);
  }

  // 3. Atomic Onboarding & Profile Sync
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        wallet_address: address,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_address" },
    )
    .select()
    .single();

  if (profileError) {
    return c.json({ error: "User profile synchronization failed" }, 500);
  }

  // 4. Secure Session Generation (JWT)
  const payload = {
    sub: profile.id,
    address: profile.wallet_address,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 Hours
  };

  const token = await sign(payload, JWT_SECRET);

  // 5. Cleanup nonce (Prevent Replay Attacks)
  await supabase.from("auth_nonces").delete().eq("address", address);

  // 6. Final Response
  return c.json({
    success: true,
    token,
    user: {
      id: profile.id,
      address: profile.wallet_address,
      username: profile.username,
      onboarding_complete: profile.onboarding_complete,
    },
  });
};
