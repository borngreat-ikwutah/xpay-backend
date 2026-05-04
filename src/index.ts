import { Hono } from "hono";
import { Bindings } from "./types";
import { userRoutes } from "./routes/user.routes";
import { agencyRoutes } from "./routes/agency.routes";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("xPay Backend API - Automated Financial Agency");
});

app.route("/users", userRoutes);
app.route("/agency", agencyRoutes);

export default app;
