import { Hono } from "hono";
import authRoutes from "./routes/auth.routes";
import agentRoutes from "./routes/agent.routes";
import { jwtGuard } from "./middleware/jwt.middleware";

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
app.route("/agent", agentRoutes);

const port = 8080;

console.log(`xPay API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
