import Stripe from "stripe";
import { VercelRequest } from "@vercel/node";
import { authHelper, jsonHelper } from "../utils/jwt_helpers";
import { url } from "node:inspector";
import pg, { redis } from "../utils/db";
import { AuthReq } from "../utils/jwt_helpers";

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
    // this should just call the orderf fun
  }
}

export const createCheckoutSession = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim;
    const key = `cart:${userId}`;

    // get the cart from the redis cache, need to save quantity and get info about item
    const itemIds = await redis.hkeys(key);

    if (itemIds.length === 0) {
      return jsonHelper({
        message: "Cart is empty",
      });
    }

    const getItems = await pg`select * from items where item_id in ${itemIds}`;

    if (getItems.length === 0) {
      return jsonHelper({
        message: "No items found",
      });
    }

    const lineItems = [];
    for (const item of getItems) {
      const getQuantity = await redis.hget(key, item.item_id);

      const newObject = {
        price_data: {
          currency: "aud",
          product_data: {
            name: item.item_name,
            images: [item.image_url],
            tax_code: "txcd_99999999",
            description: item.description,
          },
          unit_amount: Number(item.price) * 100,
        },
        quantity: Number(getQuantity),
      };

      lineItems.push(newObject);
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      customer_email: "...",
      submit_type: "pay",
      billing_address_collection: "auto",
      shipping_address_collection: {
        allowed_countries: ["AU"],
      },
      line_items: lineItems,
      mode: "payment",
      return_url: `http://https://sassysquad-backend.vercel.app/return?session_id={CHECKOUT_SESSION_ID}`, // wip, need to edit this when starting the frontend
      automatic_tax: { enabled: true },
    });

    return jsonHelper({
      clientSecret: session.client_secret,
    });
  },
);

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

export async function serverWebhook(req: VercelRequest) {
  const body = req.body;
  const signature = req.headers["stripe-signature"];

  if (!body) {
    return jsonHelper(
      {
        error: "No body provided",
      },
      400,
    );
  } else if (!signature) {
    return jsonHelper(
      {
        error: "No signature provided",
      },
      400,
    );
  }

  let event = null;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (error) {
    return jsonHelper(
      {
        message: "Webhook error",
        error: error,
      },
      400,
    );
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    try {
      await fulfillCheckout(event.data.object.id);

      return jsonHelper({
        message: "Checkout successfully fulfilled",
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Checkout failed",
          error: error,
        },
        500,
      );
    }
  }

  return jsonHelper({ error: "Event type invalid" }, 400);
}
