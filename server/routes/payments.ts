import { Hono } from "hono";
import Stripe from "stripe";
import crypto from "crypto";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const paymentRoutes = new Hono();

paymentRoutes.post("/create-checkout-session", async (c) => {
  try {
    const { email, type, billingCycle } = await c.req.json();
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === "MY_STRIPE_SECRET_KEY") {
      return c.json({ error: "Stripe not configured" }, 500);
    }
    const isYearly = billingCycle === "yearly";
    let unitAmount = 1900;
    let productName = 'Water Classroom Activation';
    if (type === "independent-student" || type === "Independent Student") { unitAmount = isYearly ? 15000 : 1500; productName = isYearly ? 'Water Classroom — Independent (Yearly)' : 'Water Classroom — Independent'; }
    else if (type === "school-student" || type === "School Student") { unitAmount = isYearly ? 12000 : 1200; productName = isYearly ? 'Water Classroom — School Student (Yearly)' : 'Water Classroom — School Student'; }
    else if (type === "water-student" || type === "Water Student") { unitAmount = isYearly ? 19000 : 1900; productName = isYearly ? 'Water Classroom — Water Student (Yearly)' : 'Water Classroom — Water Student'; }
    const stripeClient = new Stripe(stripeKey);
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', product_data: { name: productName }, unit_amount: unitAmount }, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}?payment_success=true&email=${encodeURIComponent(email)}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}?payment_cancel=true`,
    });
    return c.json({ url: session.url });
  } catch (err: any) {
    return c.json({ error: "Checkout creation failed", details: err.message }, 500);
  }
});

// ─── Institution seats (spots) ───
// An institution buys N student spots ($12/spot/month, $144/spot/year).
// Paid spots are stored on the institution row (paid_seats) and enforced
// when adding students. Credit happens in the webhook below.

// Buy more spots → Stripe checkout (institution only).
paymentRoutes.post("/create-seats-checkout", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const user = userRes.rows[0] as any;
    if (user.type !== "Institution") return c.json({ error: "Forbidden — institution account required" }, 403);
    const { spots, billingCycle } = await c.req.json();
    const count = Math.max(1, Math.min(5000, parseInt(spots) || 0));
    if (!count) return c.json({ error: "Spots must be at least 1" }, 400);
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === "MY_STRIPE_SECRET_KEY") {
      return c.json({ error: "Stripe not configured" }, 500);
    }
    const isYearly = billingCycle === "yearly" || billingCycle === "Yearly";
    const unitAmount = isYearly ? 14400 : 1200;
    const stripeClient = new Stripe(stripeKey);
    const checkout = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: isYearly ? "Water Classroom — Student Spots (Yearly)" : "Water Classroom — Student Spots (Monthly)" },
          unit_amount: unitAmount,
        },
        quantity: count,
      }],
      mode: "payment",
      metadata: { institution_id: user.id, spots: String(count), billing_cycle: isYearly ? "yearly" : "monthly" },
      success_url: `${process.env.APP_URL || "http://localhost:3000"}?seats_success=true&spots=${count}`,
      cancel_url: `${process.env.APP_URL || "http://localhost:3000"}?seats_cancel=true`,
    });
    return c.json({ url: checkout.url });
  } catch (err: any) {
    return c.json({ error: "Seats checkout failed", details: err.message }, 500);
  }
});

// Seat purchase history + this-month totals (institution only).
// Powers Profile → Payments → spots tracking.
paymentRoutes.get("/seats/purchases", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const user = userRes.rows[0] as any;
    if (user.type !== "Institution") return c.json({ error: "Forbidden — institution account required" }, 403);
    const res = await getDb().execute({
      sql: "SELECT * FROM seat_purchases WHERE institution_id = ? ORDER BY created_at DESC LIMIT 100",
      args: [user.id],
    });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let monthSpots = 0;
    let monthCents = 0;
    const purchases = (res.rows as any[]).map((r) => {
      if (new Date(r.created_at).getTime() >= monthStart) {
        monthSpots += Number(r.spots) || 0;
        monthCents += Number(r.amount_cents) || 0;
      }
      return {
        id: r.id, spots: r.spots, billing_cycle: r.billing_cycle,
        amount_cents: r.amount_cents, created_at: r.created_at,
      };
    });
    return c.json({
      purchases,
      month: {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        spots: monthSpots,
        amount_cents: monthCents,
      },
    });
  } catch (err: any) {
    return c.json({ error: "Failed to load purchases", details: err.message }, 500);
  }
});
paymentRoutes.post("/stripe/webhook", async (c) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) return c.json({ error: "Stripe webhook not configured" }, 500);
  try {
    const rawBody = await c.req.text();
    const signature = c.req.header("stripe-signature") || "";
    const stripeClient = new Stripe(stripeKey);
    const event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
    if (event.type === "checkout.session.completed") {
      const sessionObj = event.data.object as any;
      const institutionId = sessionObj.metadata?.institution_id || "";
      const spots = Math.max(0, parseInt(sessionObj.metadata?.spots) || 0);
      if (institutionId && spots > 0 && sessionObj.payment_status === "paid") {
        const purchaseId = `sp-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
        const now = new Date().toISOString();
        const amount = Number(sessionObj.amount_total || 0);
        const sessionId = String(sessionObj.id || "");
        const billing = sessionObj.metadata?.billing_cycle === "yearly" ? "yearly" : "monthly";
        // Ledger first (UNIQUE session id ⇒ Stripe retries can't double-credit)…
        const inserted = await getDb().execute({
          sql: `INSERT OR IGNORE INTO seat_purchases (id, institution_id, spots, billing_cycle, amount_cents, stripe_session_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [purchaseId, institutionId, spots, billing, amount, sessionId, now],
        });
        if (Number((inserted as any).rowsAffected ?? 1) > 0) {
          await getDb().execute({
            sql: "UPDATE turso_records SET paid_seats = COALESCE(paid_seats, 0) + ? WHERE id = ? AND type = 'Institution'",
            args: [spots, institutionId],
          });
        }
      }
    }
    return c.json({ received: true });
  } catch (err: any) {
    return c.json({ error: "Webhook failed", details: err.message }, 400);
  }
});
