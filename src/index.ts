import { Hono } from "hono";
import { Bindings } from "./types";
import { userRoutes } from "./routes/user.routes";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("xPay Backend API");
});

app.route("/users", userRoutes);

export default app;
