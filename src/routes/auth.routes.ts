import { Hono } from "hono";
import { getNonce, verifySignature } from "../auth/auth.controller";

const authRoutes = new Hono();

authRoutes.get("/nonce", getNonce);
authRoutes.post("/verify", verifySignature);

export default authRoutes;
