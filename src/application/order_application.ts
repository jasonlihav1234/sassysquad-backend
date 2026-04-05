import Stripe from "stripe";
import { VercelRequest } from "@vercel/node";
import { authHelper, jsonHelper } from "../utils/jwt_helpers";
import pg, { redis } from "../utils/db";
import { AuthReq } from "../utils/jwt_helpers";
import { create } from "xmlbuilder2";
import {
  getOrderById,
  createOrderQuery,
  updateOrdersById,
  deleteOrdersById,
} from "../database/queries/order_queries";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY!)
  : null;
export const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const validateOrder = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const contentType = req.headers?.["content-type"];

    if (!contentType || !contentType.includes("application/json")) {
      return jsonHelper(
        {
          error: "UNSUPPORTED_TYPE",
          message: "This content type is not supported",
        },
        415,
      );
    }

    const {
      orderName,
      sellerId,
      documentCurrencyCode,
      pricingCurrencyCode,
      taxCurrencyCode,
      requestedInvoiceCurrencyCode,
      accountingCost,
      paymentMethodCode,
      destinationCountryCode,
      orderLines,
    } = req.body || {};

    if (
      !orderName ||
      typeof orderName !== "string" ||
      !sellerId ||
      typeof sellerId !== "string" ||
      !documentCurrencyCode ||
      typeof documentCurrencyCode !== "string" ||
      !pricingCurrencyCode ||
      typeof pricingCurrencyCode !== "string" ||
      !taxCurrencyCode ||
      typeof taxCurrencyCode !== "string" ||
      !requestedInvoiceCurrencyCode ||
      typeof requestedInvoiceCurrencyCode !== "string" ||
      typeof accountingCost !== "number" ||
      !paymentMethodCode ||
      typeof paymentMethodCode !== "string" ||
      !destinationCountryCode ||
      typeof destinationCountryCode !== "string"
    ) {
      return jsonHelper(
        {
          error: "VALIDATION_FAILED",
          message: "The request body is missing mandatory fields",
        },
        422,
      );
    }

    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return jsonHelper(
        {
          error: "VALIDATION_FAILED",
          message: "The request body is missing mandatory fields",
        },
        422,
      );
    }

    for (const line of orderLines) {
      if (
        !line ||
        typeof line !== "object" ||
        !line.itemID ||
        typeof line.itemID !== "string" ||
        typeof line.quantity !== "number" ||
        line.quantity <= 0 ||
        typeof line.priceAtPurchase !== "number" ||
        line.priceAtPurchase < 0
      ) {
        return jsonHelper(
          {
            error: "VALIDATION_FAILED",
            message: "The request body is missing mandatory fields",
          },
          422,
        );
      }
    }

    return jsonHelper({
      message: "Order payload is valid",
    });
  },
);

export const postOrder = authHelper(async (req: AuthReq): Promise<Response> => {
  const contentType = req.headers?.["content-type"];

  if (!contentType || !contentType.includes("application/json")) {
    return jsonHelper(
      {
        error: "UNSUPPORTED_TYPE",
        message: "This content type is not supported",
      },
      415,
    );
  }
  const buyerId = req.user?.subject_claim as string; // authenticated method should be able to get id from subject claim
  const orderId = crypto.randomUUID();
  const {
    orderName,
    sellerId,
    documentCurrencyCode,
    pricingCurrencyCode,
    taxCurrencyCode,
    requestedInvoiceCurrencyCode,
    accountingCost,
    paymentMethodCode,
    destinationCountryCode,
    orderLines,
  } = req.body || {};

  if (
    !orderName ||
    typeof orderName !== "string" ||
    !buyerId ||
    typeof buyerId !== "string" ||
    !sellerId ||
    typeof sellerId !== "string" ||
    !documentCurrencyCode ||
    typeof documentCurrencyCode !== "string" ||
    !pricingCurrencyCode ||
    typeof pricingCurrencyCode !== "string" ||
    !taxCurrencyCode ||
    typeof taxCurrencyCode !== "string" ||
    !requestedInvoiceCurrencyCode ||
    typeof requestedInvoiceCurrencyCode !== "string" ||
    typeof accountingCost !== "number" ||
    !paymentMethodCode ||
    typeof paymentMethodCode !== "string" ||
    !destinationCountryCode ||
    typeof destinationCountryCode !== "string"
  ) {
    return jsonHelper(
      {
        error: "VALIDATION_FAILED",
        message: "The request body is missing mandatory fields",
      },
      422,
    );
  }

  if (sellerId === buyerId) {
    return jsonHelper(
      {
        error: "sellerId and buyerId must be unique",
      },
      400,
    );
  }

  if (!Array.isArray(orderLines) || orderLines.length === 0) {
    return jsonHelper(
      {
        error: "orderLines is required and must be a non-empty array",
      },
      422,
    );
  }

  for (const line of orderLines) {
    if (
      !line ||
      typeof line !== "object" ||
      !line.itemID ||
      typeof line.itemID !== "string" ||
      typeof line.quantity !== "number" ||
      line.quantity <= 0 ||
      typeof line.priceAtPurchase !== "number" ||
      line.priceAtPurchase < 0
    ) {
      return jsonHelper(
        {
          error: "VALIDATION_FAILED",
          message: "The request body is missing mandatory fields",
        },
        422,
      );
    }
  }

  try {
    const { xml } = await processOrderCreation({
      orderId,
      buyerId,
      sellerId,
      orderLines,
      paymentMethodCode,
      documentCurrencyCode,
      pricingCurrencyCode,
      taxCurrencyCode,
      requestedInvoiceCurrencyCode,
      accountingCost,
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
  orderId: string;
  buyerId: string;
  sellerId: string;
  orderLines: any[];
  paymentMethodCode: string;
  documentCurrencyCode: string;
  pricingCurrencyCode: string;
  taxCurrencyCode: string;
  requestedInvoiceCurrencyCode: string;
  accountingCost: number;
  destinationCountryCode: string;
}) {
  const {
    orderId,
    buyerId,
    sellerId,
    orderLines,
    paymentMethodCode,
    documentCurrencyCode,
    pricingCurrencyCode,
    taxCurrencyCode,
    requestedInvoiceCurrencyCode,
    accountingCost,
    destinationCountryCode,
  } = data;
  const newOrder = {
    orderId,
    orderName: `order-${orderId}`,
    buyerId,
    sellerId,
    documentCurrencyCode,
    pricingCurrencyCode,
    taxCurrencyCode,
    requestedInvoiceCurrencyCode,
    accountingCost,
    paymentMethodCode,
    destinationCountryCode,
    orderLines,
    createdAt: new Date().toISOString(),
  };

  const orderJson = {
    Order: {
      "@xmlns": "urn:oasis:names:specification:ubl:schema:xsd:Order-2",
      "@xmlns:cac":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "@xmlns:cbc":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",

      "cbc:ID": newOrder.orderId,
      "cbc:IssueDate": newOrder.createdAt.slice(0, 10),

      "cbc:RequestedInvoiceCurrencyCode": newOrder.requestedInvoiceCurrencyCode,
      "cbc:DocumentCurrencyCode": newOrder.documentCurrencyCode,
      "cbc:PricingCurrencyCode": newOrder.pricingCurrencyCode,
      "cbc:TaxCurrencyCode": newOrder.taxCurrencyCode,
      "cbc:AccountingCost": newOrder.accountingCost,

      "cac:BuyerCustomerParty": {
        "cbc:CustomerAssignedAccountID": newOrder.buyerId,
      },

      "cac:SellerSupplierParty": {
        "cbc:CustomerAssignedAccountID": newOrder.sellerId,
      },

      "cac:PaymentMeans": {
        "cbc:PaymentMeansCode": newOrder.paymentMethodCode,
      },

      "cac:DestinationCountry": {
        "cbc:IdentificationCode": newOrder.destinationCountryCode,
      },

      "cac:OrderLine": newOrder.orderLines.map((line: any) => ({
        "cac:LineItem": {
          "cbc:ID": crypto.randomUUID(),
          "cbc:Quantity": String(line.quantity),
          "cac:Item": {
            "cbc:Name": line.itemName || line.itemID,
          },
        },
      })),
    },
  };

  const xml = create(orderJson).end({ prettyPrint: true });

  const items = newOrder.orderLines.map((line: any) => ({
    itemId: line.itemID,
    quantity: line.quantity,
    priceAtPurchase: line.priceAtPurchase,
  }));

  const response = await createOrderQuery(
    newOrder.orderId,
    newOrder.orderName,
    newOrder.buyerId,
    newOrder.sellerId,
    newOrder.documentCurrencyCode,
    newOrder.pricingCurrencyCode,
    newOrder.taxCurrencyCode,
    newOrder.requestedInvoiceCurrencyCode,
    newOrder.accountingCost,
    newOrder.paymentMethodCode,
    newOrder.destinationCountryCode,
    xml,
    items,
  );

  return { xml, response };
}

export async function fulfillCheckout(session: Stripe.Checkout.Session) {
  console.log("fulfilling checkout session");
  const buyerId = session.metadata?.buyerId as string;
  const sellerId = session.metadata?.sellerId as string;
  const sessionId = session.id;

  const checkoutSession = await stripe!.checkout.sessions.retrieve(sessionId, {
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
        orderId: crypto.randomUUID(),
        buyerId,
        sellerId,
        orderLines,
        paymentMethodCode,
        documentCurrencyCode: "aud",
        pricingCurrencyCode: "aud",
        taxCurrencyCode: "aud",
        requestedInvoiceCurrencyCode: "aud",
        accountingCost: 1.5,
        destinationCountryCode,
      });

      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}

// sellerId has to be in the body
export const createCheckoutSession = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim;
    const sellerId = req.body.sellerId;
    const email = req.body.email;
    const key = `cart:${userId}`;

    if (!sellerId || !email) {
      return jsonHelper(
        {
          message: "Missing email or sellerId",
        },
        400,
      );
    }

    // get the cart from the redis cache, need to save quantity and get info about item
    const itemIds = await redis.hkeys(key);

    if (itemIds.length === 0) {
      return jsonHelper({
        message: "Cart is empty",
      });
    }

    const getItems =
      await pg`select * from items where item_id in ${pg(itemIds)}`;

    if (getItems.length === 0) {
      return jsonHelper({
        message: "No items found",
      });
    }

    const lineItems = [];
    for (const item of getItems) {
      const getQuantity = await redis.hget(key, item.item_id);
      const stripePrice = Math.round(Number(item.price) * 100);

      const newObject = {
        price_data: {
          currency: "aud",
          product_data: {
            name: item.item_name,
            tax_code: "txcd_99999999",
            description: item.description,
            metadata: {
              item_id: item.item_id,
            },
          },
          unit_amount: stripePrice,
        },
        quantity: Number(getQuantity),
      };

      lineItems.push(newObject);
    }

    const session = await stripe!.checkout.sessions.create({
      metadata: {
        userId: userId ?? "",
        sellerId: sellerId ?? "",
      },
      ui_mode: "embedded",
      customer_email: email,
      submit_type: "pay",
      billing_address_collection: "auto",
      shipping_address_collection: {
        allowed_countries: ["AU"],
      },
      line_items: lineItems,
      mode: "payment",
      return_url: `https://sassysquad-backend.vercel.app/return?session_id={CHECKOUT_SESSION_ID}`, // wip, need to edit this when starting the frontend
      automatic_tax: { enabled: true },
    });

    return jsonHelper({
      clientSecret: session.client_secret,
    });
  },
);

export const checkCheckoutSessionStatus = authHelper(
  async (req: AuthReq): Promise<Response> => {
    if (!req.query || !req.query.session_id) {
      return jsonHelper(
        {
          message: "Session cannot be found",
        },
        404,
      );
    }
    const queryId = req.query.session_id;
    const sessionId = Array.isArray(queryId) ? queryId[0] : queryId;

    try {
      const session = await stripe!.checkout.sessions.retrieve(sessionId);

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
    event = await stripe!.webhooks.constructEventAsync(
      body,
      signature,
      endpointSecret,
    );
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
      console.log(error);
      return jsonHelper({ error: "Event type invalid" }, 400);
    }
  }

  return jsonHelper({ error: "No event types match" }, 404);
}

// post with itemId and quantity and userId in body
export const addItemToCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // use the subject claim
      const userId = req.user?.subject_claim;
      const body = req.body;
      // cart should implicitly know that a item already exists since you can only
      // call this through the frontend which displays all already existing items
      if (!body.itemId || !body.quantity) {
        return jsonHelper(
          {
            error: "Need item ID and quantity in the body",
          },
          400,
        );
      }

      const [item] = await pg`
      select item_id, quantity_available
      from items
      where item_id = ${body.itemId}
      `;

      if (!item) {
        return jsonHelper({ error: "Item does not exist" }, 404);
      }

      if (item.quantity_available < body.quantity) {
        return jsonHelper({ error: "Not enough items in stock" }, 400);
      }

      // users should share carts between devices
      const key = `cart:${userId}`;
      await redis.hset(key, body.itemId, body.quantity);
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

export const deleteItemFromCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const splitUrl = req?.url?.split("/");
      let deleteAllItems = false;
      const userId = req.user?.subject_claim;

      // case of /cart
      if (splitUrl?.length === 2) {
        deleteAllItems = true;
      }
      const itemId = splitUrl?.at(3) as string;

      if (deleteAllItems) {
        const numDeleted = await redis.del(`cart:${userId}`);

        if (numDeleted === 0) {
          return jsonHelper({
            message: "No items in the cart to delete",
          });
        }
      } else {
        const numDeleted = await redis.hdel(`cart:${userId}`, itemId);

        if (numDeleted === 0) {
          return jsonHelper({
            message: "Item does not exist in the cart to delete",
          });
        }
      }

      return jsonHelper({
        message: "Item/s successfully removed from cart",
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Item/s failed to remove from cart",
          error: error,
        },
        500,
      );
    }
  },
);

// in a cart you can only change the quantity of an item
export const updateCartItem = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const itemId = req.url?.split("/").at(3) as string;
    const userId = req.user?.subject_claim;
    const body = req.body;

    // body will have updated fields
    // quanatity should also not be higher than available
    const query =
      await pg`select quantity_available from items where item_id = ${itemId}`;
    if (query.length === 0) {
      return jsonHelper(
        {
          message: "Item does not exist",
        },
        404,
      );
    }
    const numAvailable = query[0].quantity_available;
    // checkout should have a final check as well
    if (Object.keys(body).length === 0 || body.quantity === undefined) {
      return jsonHelper(
        {
          message: "Quantity not provided to update cart item",
        },
        400,
      );
    } else if (body.quantity <= 0 || numAvailable < body.quantity) {
      return jsonHelper(
        {
          message: "Invalid quantity to set",
        },
        400,
      );
    }

    try {
      const quantity = body.quantity;
      const key = `cart:${userId}`;
      await redis.hset(`cart:${userId}`, itemId, quantity);
      await redis.expire(key, 86400);

      return jsonHelper({
        message: "Item successfully updated",
      });
    } catch (error) {
      console.log(error);

      return jsonHelper(
        {
          message: "Item failed to update",
          error: error,
        },
        500,
      );
    }
  },
);

export const deleteOrder = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim;
    const orderId = req.url?.split("/").pop() as string;

    if (!orderId) {
      return jsonHelper(
        {
          message: "OrderID invalid.",
          error: "Bad Request",
        },
        400,
      );
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return jsonHelper(
        {
          message: "Order not found.",
          error: "Not Found",
        },
        404,
      );
    }

    if (userId !== order.buyer_id && userId !== order.seller_id) {
      return jsonHelper(
        {
          message: "User does not have permission to delete order.",
          error: "Unauthorised",
        },
        403,
      );
    }

    await deleteOrdersById(orderId);

    return jsonHelper({ message: "Order successfully deleted" });
  },
);

// gets an order given its id
export const listOrder = authHelper(async (req: AuthReq): Promise<Response> => {
  const orderId = req.url?.split("/").pop() as string;
  const userId = req.user?.subject_claim;

  if (!orderId) {
    return jsonHelper(
      {
        message: "OrderID invalid.",
        error: "Bad Request",
      },
      400,
    );
  }

  const order = await getOrderById(orderId);

  if (!order) {
    return jsonHelper(
      {
        message: "Order not found.",
        error: "Not Found",
      },
      404,
    );
  }

  if (userId !== order.buyer_id && userId !== order.seller_id) {
    return jsonHelper(
      {
        message: "User does not have permission to view this order.",
        error: "Unauthorised",
      },
      403,
    );
  }

  return jsonHelper({
    order: order,
  });
});

export const updateOrder = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim;
    const { updates } = req.body || {};
    const orderId = req.url?.split("/").pop();

    if (!orderId) {
      return jsonHelper(
        {
          error: "Bad request",
        },
        400,
      );
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return jsonHelper(
        {
          error: "Order not found!",
        },
        404,
      );
    }

    if (userId !== order.buyer_id && userId !== order.seller_id) {
      return jsonHelper(
        {
          error: "Forbidden",
        },
        403,
      );
    }

    try {
      await updateOrdersById(orderId, updates);

      return jsonHelper({
        message: "Order update successful",
      });
    } catch (error) {
      console.log(error);

      return jsonHelper(
        {
          error: "Order update failed",
        },
        500,
      );
    }
  },
);

export const getOrder = authHelper(async (req: AuthReq): Promise<Response> => {
  // get accept header from req
  const accept =
    (req.headers as unknown as Headers)?.get?.("accept") ||
    req.headers?.["accept"];

  // get orderId from URL
  const orderId = req.url?.split("/").pop();

  // Synytax validation
  if (!orderId || orderId.length > 100) {
    return jsonHelper(
      {
        error: "INVALID_ID",
        message: "The id provided is syntactically invalid",
      },
      400,
    );
  }

  try {
    // query databse for order using orderID provided
    const order = await getOrderById(orderId);

    // order doesnt exist in databse
    if (!order) {
      return jsonHelper(
        {
          error: "ID_NOT_FOUND",
          message: "Id does not exist or is invalid",
        },
        404,
      );
    }

    // return previously generated UBL XML stored in databse - we should probably send the whole response cause there are fields in the order that we might need

    return jsonHelper({
      message: "Order successfully retrieved",
      order: order,
    });
  } catch (error) {
    // unexpected errors such as interval server issues por databse
    return jsonHelper(
      {
        error: "INTERNAL_ERROR",
        message: "An internal error occured while executing the operation",
      },
      500,
    );
  }
});
