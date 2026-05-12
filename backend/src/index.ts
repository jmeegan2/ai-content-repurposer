import "dotenv/config";
import express from "express";
import cors from "cors";
import jobsRouter from "./routes/jobs.js";
import stripeRouter, { webhookRouter } from "./routes/stripe.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));

// Webhook must be registered before express.json() — Stripe requires raw body
app.use("/stripe", webhookRouter);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/jobs", requireAuth, jobsRouter);
app.use("/stripe", requireAuth, stripeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
