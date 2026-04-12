import { Hono } from "hono";
import authRoutes from "./auth/auth.routes";
import { claimRefund, initSession, tip } from "./controllers/agent.controller";
import { jwtGuard } from "./middleware/jwt.middleware";
import { x402Guard } from "./middleware/x402.middleware";

const app = new Hono();

/**
 * Health check
 */
app.get("/", (c) => {
  return c.json({
    success: true,
    service: "xPay API",
    network: "Stellar Testnet",
  });
});

/**
 * Auth routes
 */
app.route("/auth", authRoutes);

/**
 * Protected user routes
 */
const userRoutes = new Hono();

userRoutes.use("*", jwtGuard);

userRoutes.get("/me", (c) => {
  const payload = c.get("jwtPayload");

  return c.json({
    success: true,
    user: {
      id: payload.sub ?? null,
      address: payload.address ?? null,
    },
  });
});

app.route("/user", userRoutes);

/**
 * Protected agent routes
 */
const agentRoutes = new Hono();

agentRoutes.use("*", jwtGuard);
agentRoutes.post("/tip", x402Guard, tip);
agentRoutes.post("/init-session", initSession);
agentRoutes.post("/claim-refund", x402Guard, claimRefund);

app.route("/agent", agentRoutes);

export default app;
