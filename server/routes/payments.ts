import { Hono } from "hono";
import Stripe from "stripe";
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
      metadata: { institution_id: user.id, spots: String(count) },
      success_url: `${process.env.APP_URL || "http://localhost:3000"}?seats_success=true&spots=${count}`,
      cancel_url: `${process.env.APP_URL || "http://localhost:3000"}?seats_cancel=true`,
    });
    return c.json({ url: checkout.url });
  } catch (err: any) {
    return c.json({ error: "Seats checkout failed", details: err.message }, 500);
  }
});

// Stripe webhook: credit paid_seats when a seats checkout completes.
// Configure STRIPE_WEBHOOK_SECRET in the Stripe dashboard for this endpoint.
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
        await getDb().execute({
          sql: "UPDATE turso_records SET paid_seats = COALESCE(paid_seats, 0) + ? WHERE id = ? AND type = 'Institution'",
          args: [spots, institutionId],
        });
      }
    }
    return c.json({ received: true });
  } catch (err: any) {
    return c.json({ error: "Webhook failed", details: err.message }, 400);
  }
});
