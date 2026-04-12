import { Hono } from "hono";
import { claimRefund, initSession, tip } from "../controllers/agent.controller";
import { jwtGuard } from "../middleware/jwt.middleware";
import { x402Guard } from "../middleware/x402.middleware";

const agentRoutes = new Hono();

agentRoutes.use("*", jwtGuard);

agentRoutes.post("/tip", x402Guard, tip);
agentRoutes.post("/init-session", initSession);
agentRoutes.post("/claim-refund", x402Guard, claimRefund);

export default agentRoutes;
