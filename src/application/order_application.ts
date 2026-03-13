import Stripe from "stripe";
import { VercelRequest } from "@vercel/node";
import { jsonHelper } from "../utils/jwt_helpers";
import { url } from "node:inspector";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function fulfillCheckout(sessionId: string) {
  console.log("fulfilling checkout session");

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });

  if (checkoutSession.payment_status !== "unpaid") {
    // perform fulfillment of line items
    // record and save fulfillment status in db
    // remove x amount from database
  }
}

export async function createCheckoutSession(req: VercelRequest) {
  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    customer_email: "...",
    submit_type: "pay",
    billing_address_collection: "auto",
    shipping_address_collection: {
      allowed_countries: ["AU"],
    },
    line_items: [
      // need some way to pass in the line items here
    ],
    mode: "payment",
    return_url: `http://https://sassysquad-backend.vercel.app/return?session_id={}`, // wip, need to edit this when starting the frontend
    automatic_tax: { enabled: true },
  });

  return jsonHelper({
    clientSecret: session.client_secret,
  });
}

export async function checkCheckoutSessionStatus(req: VercelRequest) {
  const queryId = req.query.session_id;
  const sessionId = Array.isArray(queryId) ? queryId[0] : queryId;

  if (!sessionId) {
    return jsonHelper(
      {
        message: "Session cannot be found",
      },
      404,
    );
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return jsonHelper({
    status: session.status,
    customer_email: session.customer_details?.email ?? "No email provided",
  });
}
