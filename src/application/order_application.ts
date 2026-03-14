import Stripe from "stripe";
import { VercelRequest } from "@vercel/node";
import { authHelper, jsonHelper } from "../utils/jwt_helpers";
import { url } from "node:inspector";
import pg, { redis } from "../utils/db";
import { AuthReq } from "../utils/jwt_helpers";
import { create } from "xmlbuilder2";
import { createOrderQuery } from "../database/queries/order_queries";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const postOrder = authHelper(async (req: AuthReq): Promise<Response> => {
  const buyerId = req.user?.subject_claim as string; // authenticated method should be able to get id from subject claim
  const {
    userId,
    orderLines,
    sellerId,
    paymentMethodCode,
    destinationCountryCode,
  } = req.body || {};

  if (!userId || typeof userId !== "string") {
    return jsonHelper(
      {
        error: "userId is required and must be a string",
      },
      400,
    );
  }

  if (!Array.isArray(orderLines) || orderLines.length === 0) {
    return jsonHelper(
      { error: "orderLines is required and must be a non-empty array" },
      400,
    );
  }

  try {
    const { xml } = await processOrderCreation({
      buyerId,
      sellerId,
      orderLines,
      paymentMethodCode,
      destinationCountryCode,
    });

    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
      status: 200,
    });
  } catch (error) {
    return jsonHelper(
      {
        message: "Order creation failed",
        error: error,
      },
      500,
    );
  }
});

export async function processOrderCreation(data: {
  buyerId: string;
  sellerId: string;
  orderLines: any[];
  paymentMethodCode: string;
  destinationCountryCode: string;
}) {
  const {
    buyerId,
    sellerId,
    orderLines,
    paymentMethodCode,
    destinationCountryCode,
  } = data;
  const newOrder = {
    orderId: crypto.randomUUID(),
    buyerId,
    orderLines,
    createdAt: new Date().toISOString(),
  };

  // Buildj JSON object
  const orderJson = {
    Order: {
      "@xmlns": "urn:oasis:names:specification:ubl:schema:xsd:Order-2",
      "@xmlns:cac":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "@xmlns:cbc":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",

      "cbc:ID": newOrder.orderId,
      "cbc:IssueDate": newOrder.createdAt.slice(0, 10),

      "cac:BuyerCustomerParty": {
        "cac:Party": {
          "cbc:CustomerAssignedAccountID": newOrder.buyerId,
        },
      },

      "cac:OrderLine": newOrder.orderLines.map((line, index) => ({
        "cbc:ID": crypto.randomUUID(),
        "cbc:Quantity": String(line.quantity),
        "cac:Item": {
          "cbc:Name": line.itemName || "Unknown Item",
        },
      })),
    },
  };

  // Now conbvet JSON to XML
  const xml = create(orderJson).end({ prettyPrint: true });

  // store the order in the database
  // have a default order name which the user edit later
  const response = await createOrderQuery(
    `order-${newOrder.orderId}`,
    buyerId,
    sellerId,
    "aud",
    "aud",
    "aud",
    "aud",
    1.5,
    paymentMethodCode,
    destinationCountryCode,
    xml,
    orderLines,
  );

  return { xml, response };
}

async function fulfillCheckout(session: Stripe.Checkout.Session) {
  console.log("fulfilling checkout session");
  const buyerId = session.metadata?.buyerId as string;
  const sellerId = session.metadata?.sellerId as string;
  const sessionId = session.id;

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product", "payment_intent.payment_method"],
  });

  let paymentMethodCode = "none";
  if (checkoutSession.payment_status !== "unpaid") {
    if (
      checkoutSession.payment_intent &&
      typeof checkoutSession.payment_intent !== "string"
    ) {
      const paymentIntent =
        checkoutSession.payment_intent as Stripe.PaymentIntent;

      if (
        paymentIntent.payment_method &&
        typeof paymentIntent.payment_method !== "string"
      ) {
        const paymentMethod =
          paymentIntent.payment_method as Stripe.PaymentMethod;

        if (paymentMethod.type === "card" && paymentMethod.card?.brand) {
          paymentMethodCode = paymentMethod.card.brand;
        } else {
          paymentMethodCode = paymentMethod.type;
        }
      }
    }

    const safeSession = checkoutSession as any;
    // might be an issue need to check for this
    const destinationCountryCode =
      safeSession.shipping_details?.address?.country || "AU";
    const rawLineItems = checkoutSession.line_items?.data || [];
    const orderLines = rawLineItems.map((stripeItem) => {
      const product = stripeItem.price?.product as Stripe.Product;
      const itemId = product?.metadata?.item_id || "unknown_item";

      const unitAmountCents = stripeItem.price?.unit_amount || 0;
      const priceAtPurchase = unitAmountCents / 100;

      return {
        itemId: itemId,
        quantity: stripeItem.quantity || 0,
        priceAtPurchase: priceAtPurchase,
        taxPercentPer: 0,
      };
    });

    // perform fulfillment of line items
    // record and save fulfillment status in db
    // remove x amount from database
    // this should just call the orderf fun
    // here I would call the post orders method
    try {
      await processOrderCreation({
        buyerId,
        sellerId,
        orderLines,
        paymentMethodCode,
        destinationCountryCode,
      });
    } catch (error) {
      console.log(error);
    }
  }
}

// sellerId has to be in the body
export const createCheckoutSession = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim;
    const sellerId = req.body?.sellerId;
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
            metadata: {
              item_id: item.item_id,
            },
          },
          unit_amount: Number(item.price) * 100,
        },
        quantity: Number(getQuantity),
      };

      lineItems.push(newObject);
    }

    const session = await stripe.checkout.sessions.create({
      metadata: {
        userId: userId ?? "",
        sellerId: sellerId ?? "",
      },
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

export const checkCheckoutSessionStatus = authHelper(
  async (req: AuthReq): Promise<Response> => {
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

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      return jsonHelper({
        status: session.status,
        customer_email: session.customer_details?.email ?? "No email provided",
      });
    } catch (error) {
      return jsonHelper(
        {
          error: "Failed to retrieve session status",
        },
        500,
      );
    }
  },
);

export async function serverWebhook(req: VercelRequest): Promise<Response> {
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
      await fulfillCheckout(event.data.object);

      return jsonHelper({
        message: "Checkout successfully fulfilled",
      });
    } catch (error) {
      return jsonHelper({ error: "Event type invalid" }, 400);
    }
  }

  return jsonHelper({ error: "No event types match " }, 404);
}

// post with itemId and quantity and userId in body
export const addItemToCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const body = req.body;

      if (!body.itemId || !body.quantity || !body.userId) {
        return jsonHelper(
          {
            error: "Need userID, item ID, and quantity in the body",
          },
          400,
        );
      }
      // users should share carts between devices
      const key = `cart:${body.userId}:${body.itemId}`;
      await redis.set(key, body.quantity);
      await redis.expire(key, 86400); // cart expires in 1 day

      return jsonHelper({
        message: "Item successfully added to cart",
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Item failed to add to cart",
          error: error,
        },
        500,
      );
    }
  },
);
