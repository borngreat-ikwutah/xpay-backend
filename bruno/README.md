# xPay Bruno Collection

This directory contains a Bruno collection for testing the xPay API.

## What’s included

- `bruno.json` — collection metadata
- `local.bru` — local environment variables
- `auth/` — auth endpoints
- `user/` — protected user endpoints
- `agent/` — protected agent/payment endpoints

## Environment

The collection is set up for local development:

- `baseUrl`: `http://localhost:8080`

If your API runs on a different port or host, update `local.bru`.

## Required variables

You should set these in Bruno before running protected requests:

- `jwt` — the JWT returned by `POST /auth/verify`

## Testing flow

### 1. Get a nonce
Call:

- `GET /auth/nonce?address=G...`

Copy the returned nonce.

### 2. Verify the signature
Call:

- `POST /auth/verify`

Send:
- the Stellar public key
- the Freighter signed message
- the nonce

Copy the returned JWT.

### 3. Test protected routes
Use the JWT in the `Authorization` header:

- `GET /user/me`
- `POST /agent/tip`
- `POST /agent/init-session`
- `POST /agent/claim-refund`

## API routes in this app

- `GET /`
- `GET /auth/nonce`
- `POST /auth/verify`
- `GET /user/me`
- `POST /agent/tip`
- `POST /agent/init-session`
- `POST /agent/claim-refund`

## Notes

- Replace the placeholder Stellar public keys with valid testnet addresses.
- Replace `signedMessage` with an actual Freighter signature for the SIWS message.
- Replace `txHash` with a real Stellar transaction hash when testing payment-related routes.

## Suggested request order

1. `Get Nonce`
2. `Verify Signature`
3. `Me`
4. `Tip`
5. `Init Session`
6. `Claim Refund`

## Troubleshooting

- **401 Unauthorized**: the JWT is missing, invalid, or expired.
- **402 Payment Required**: the request is missing `txHash` for a paid route.
- **400 Bad Request**: one or more required fields are missing.
- **500 Server Error**: check your server logs and environment variables.

## Environment variables used by the API

Your backend expects values like:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `AGENT_SECRET_KEY`
- `STELLAR_RPC_URL` or `SOROBAN_RPC_URL` if you override the default RPC

## Security reminder

Do not commit secrets to source control.
Use environment variables for all private keys and service keys.