import { describe, expect, spyOn, mock } from "bun:test";
import pg, { redis } from "../../src/utils/db";
import test, { beforeEach, afterEach } from "node:test";
import {
  deleteTestData,
  generateAuthenticatedRequest,
  generateRequest,
  insertItem,
  insertOrder,
  registerAndLogin,
  resetDb,
} from "../test_helper";
import {
  checkCheckoutSessionStatus,
  createCheckoutSession,
  serverWebhook,
  processOrderCreation,
  postOrder,
  updateOrder,
  listOrder,
  deleteOrder,
  getOrder,
  validateOrder,
  stripe,
  fulfillCheckout,
} from "../../src/application/order_application";
import * as OrderApp from "../../src/application/order_application";
import * as db from "../../src/database/queries/order_queries";
import Stripe from "stripe";
import { convert } from "xmlbuilder2";

afterEach(() => {
  mock.restore();
});

describe("Creating checkout session", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("Empty cart", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/create-checkout-session",
      "POST",
      {
        sellerId: crypto.randomUUID(),
        email: "test123@gmail.com",
      },
      accessToken,
    );

    const response = await createCheckoutSession(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Cart is empty");
  });

  test("Item from cart cannot be found", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/create-checkout-session",
      "POST",
      {
        sellerId: crypto.randomUUID(),
        email: "test123@gmail.com",
      },
      accessToken,
    );
    const randomItemId = crypto.randomUUID();
    await redis.hset(`cart:${userId}`, randomItemId, "20");

    const response = await createCheckoutSession(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("No items found");
  });

  test("SellerId not provided", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/create-checkout-session",
      "POST",
      {
        email: "test123@gmail.com",
      },
      accessToken,
    );

    const response = await createCheckoutSession(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("Missing email or sellerId");
  });

  test("Email not provided", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/create-checkout-session",
      "POST",
      {
        sellerId: crypto.randomUUID(),
      },
      accessToken,
    );

    const response = await createCheckoutSession(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("Missing email or sellerId");
  });

  test("Session gets successfully created", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/create-checkout-session",
      "POST",
      {
        sellerId: crypto.randomUUID(),
        email: "test123@gmail.com",
      },
      accessToken,
    );

    const itemId = crypto.randomUUID();
    await pg`insert into items 
            (item_id, item_name, image_url, description, price, quantity_available)
            values
            (${itemId}, ${"random_name"}, ${"daklwndakljndka"}, ${"aadawdadadad"}, ${2.5}, ${100})`;
    await redis.hset(`cart:${userId}`, itemId, "20");

    const response = await createCheckoutSession(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clientSecret).not.toBe(undefined);
  });
});

describe("Check checkout session status tests", async () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("No session given", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      accessToken: accessToken,
    } as any;

    const response = await checkCheckoutSessionStatus(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("Session cannot be found");
  });

  test("Session does not exist", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const request = generateAuthenticatedRequest(
      "/checkout-session-status?session_id=gjknskjefn123",
      "GET",
      {},
      accessToken,
    );

    request.query = {
      session_id: "gjknskjefn123",
    };

    const response = await checkCheckoutSessionStatus(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to retrieve session status");
  });

  test("Successfully check session", async () => {
    await redis.send("FLUSHDB", []);
    const { userId, accessToken } = await registerAndLogin(
      "test123@gmail.com",
      "username",
      "password",
    );

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Test Item" },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "http://localhost/success",
      cancel_url: "http://localhost/cancel",
    });

    // 2. Grab the actual session ID
    const sessionId = session.id;

    const request = generateAuthenticatedRequest(
      `/checkout-session-status?session_id=${sessionId}`,
      "GET",
      {},
      accessToken,
    );
    request.query = {
      session_id: sessionId,
    };

    const response = await checkCheckoutSessionStatus(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("open");
    expect(body.customer_email).toBe("No email provided");
  });
});

describe("Webhook tests", async () => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  test("Fails when no body is provided", async () => {
    const request = {
      body: undefined,
      headers: {
        "stripe-signature": "fake_signature_123",
      },
    } as any;

    const response = await serverWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No body provided");
  });

  test("Fails when no signature is provided", async () => {
    const request = {
      body: { some: "data" },
      headers: {},
    } as any;

    const response = await serverWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No signature provided");
  });

  test("Fails with invalid webhook signature", async () => {
    const request = {
      body: JSON.stringify({ type: "checkout.session.completed" }),
      headers: {
        "stripe-signature": "t=1620000000,v1=fake_invalid_hash_123",
      },
    } as any;

    const response = await serverWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("Webhook error");
    expect(body.error).toBeDefined();
  });

  test("Successfully processes checkout.session.completed", async () => {
    const fulfillSpy = spyOn(OrderApp, "fulfillCheckout").mockResolvedValue(
      true,
    );
    const mockEventData = {
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
        },
      },
    };

    const payloadString = JSON.stringify(mockEventData);

    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: payloadString,
      secret: endpointSecret,
    });

    const request = {
      body: payloadString,
      headers: {
        "stripe-signature": header,
      },
    } as any;

    const response = await serverWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Checkout successfully fulfilled");
  });

  test("Returns 404 for unhandled event types", async () => {
    const mockEventData = {
      id: "evt_test_999",
      type: "customer.created",
      data: {
        object: {
          id: "cus_test_123",
        },
      },
    };

    const payloadString = JSON.stringify(mockEventData);

    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: payloadString,
      secret: endpointSecret,
    });

    const request = {
      body: payloadString,
      headers: {
        "stripe-signature": header,
      },
    } as any;

    const response = await serverWebhook(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("No event types match");
  });
});

describe("Testing processOrderCreation", () => {
  test("Order is created when inputting fields to function", async () => {
    const querySpy = spyOn(db, "createOrderQuery").mockResolvedValue(
      new Response(JSON.stringify({ test: "Hello" })),
    );

    const result = await processOrderCreation({
      orderId: "1234",
      buyerId: "1234",
      sellerId: "1234",
      orderLines: [],
      paymentMethodCode: "1234",
      documentCurrencyCode: "string",
      pricingCurrencyCode: "string",
      taxCurrencyCode: "string",
      requestedInvoiceCurrencyCode: "string",
      accountingCost: 1.5,
      destinationCountryCode: "string",
    });

    expect(querySpy).toHaveBeenCalled();
    expect(result.xml).not.toBe(undefined);
    expect(result.response).not.toBe(undefined);

    querySpy.mockRestore();
  });
});

describe("Validate order tests", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await deleteTestData({
        userIds: [userId],
      });
    }
    userId = null;
  });

  test("returns 401 when authorization header is missing", async () => {
    const request = generateRequest("/orders/validate", "POST", {
      orderName: "test-order",
    });

    request.headers = {
      "content-type": "application/json",
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authorization is header missing");
  });

  test("returns 415 for unsupported content type", async () => {
    const rl = await registerAndLogin(
      "validate1@gmail.com",
      "validateuser1",
      "password123",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/validate",
      "POST",
      {},
      rl.accessToken,
    );

    request.headers = {
      "content-type": "text/plain",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_TYPE");
    expect(body.message).toBe("This content type is not supported");
  });

  test("returns 422 when mandatory fields are missing", async () => {
    const rl = await registerAndLogin(
      "validate2@gmail.com",
      "validateuser2",
      "password123",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/validate",
      "POST",
      {
        orderName: "test-order",
      },
      rl.accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.message).toBe("The request body is missing mandatory fields");
  });

  test("returns 422 when orderLines is empty", async () => {
    const rl = await registerAndLogin(
      "validate3@gmail.com",
      "validateuser3",
      "password123",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/validate",
      "POST",
      {
        orderName: "test-order",
        sellerId: crypto.randomUUID(),
        documentCurrencyCode: "AUD",
        pricingCurrencyCode: "AUD",
        taxCurrencyCode: "AUD",
        requestedInvoiceCurrencyCode: "AUD",
        accountingCost: 1.5,
        paymentMethodCode: "card",
        destinationCountryCode: "AU",
        orderLines: [],
      },
      rl.accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.message).toBe("The request body is missing mandatory fields");
  });

  test("returns 422 when order line is invalid", async () => {
    const rl = await registerAndLogin(
      "validate4@gmail.com",
      "validateuser4",
      "password123",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/validate",
      "POST",
      {
        orderName: "test-order",
        sellerId: crypto.randomUUID(),
        documentCurrencyCode: "AUD",
        pricingCurrencyCode: "AUD",
        taxCurrencyCode: "AUD",
        requestedInvoiceCurrencyCode: "AUD",
        accountingCost: 1.5,
        paymentMethodCode: "card",
        destinationCountryCode: "AU",
        orderLines: [
          {
            itemID: "item-1",
            quantity: 0,
            priceAtPurchase: 10,
          },
        ],
      },
      rl.accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.message).toBe("The request body is missing mandatory fields");
  });

  test("returns 200 when order payload is valid", async () => {
    const rl = await registerAndLogin(
      "validate5@gmail.com",
      "validateuser5",
      "password123",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/validate",
      "POST",
      {
        orderName: "test-order",
        sellerId: crypto.randomUUID(),
        documentCurrencyCode: "AUD",
        pricingCurrencyCode: "AUD",
        taxCurrencyCode: "AUD",
        requestedInvoiceCurrencyCode: "AUD",
        accountingCost: 1.5,
        paymentMethodCode: "card",
        destinationCountryCode: "AU",
        orderLines: [
          {
            itemID: "item-1",
            quantity: 2,
            priceAtPurchase: 10,
          },
        ],
      },
      rl.accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await validateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Order payload is valid");
  });
});

describe("Post order tests", () => {
  let userId: any = null;
  let userId2: any = null;
  let orderId: any = null;
  let itemId = crypto.randomUUID();

  afterEach(async () => {
    await deleteTestData({
      userIds: [userId, userId2].filter(Boolean),
      orderIds: [orderId].filter(Boolean),
      itemIds: [itemId],
    });
  });

  test("wrong content type", async () => {
    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const request = {
      url: "/order",
      method: "POST",
      headers: {
        "Content-Type": "application/not_json",
        Authorization: `Bearer ${rl.accessToken}`,
      },
      body: {
        test: "yes",
      },
      json: async () => {
        test: "yes";
      },
    } as any;

    const response = await postOrder(request);
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_TYPE");
    expect(body.message).toBe("This content type is not supported");
  });

  test("missing mandatory fields", async () => {
    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const request = {
      url: "/order",
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${rl.accessToken}`,
      },
      body: {
        test: "yes",
      },
      json: async () => {
        test: "yes";
      },
    } as any;

    const response = await postOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.message).toBe("The request body is missing mandatory fields");
  });

  test("Missing order line", async () => {
    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order",
      "POST",
      {
        orderName: "test",
        buyerId: "test",
        sellerId: "test",
        documentCurrencyCode: "test",
        pricingCurrencyCode: "test",
        taxCurrencyCode: "test",
        requestedInvoiceCurrencyCode: "test",
        accountingCost: 1.5,
        paymentMethodCode: "test",
        destinationCountryCode: "test",
      },
      rl.accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await postOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe(
      "orderLines is required and must be a non-empty array",
    );
  });

  test("Invalid order line", async () => {
    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order",
      "POST",
      {
        orderName: "test",
        buyerId: "test",
        sellerId: "test",
        documentCurrencyCode: "test",
        pricingCurrencyCode: "test",
        taxCurrencyCode: "test",
        requestedInvoiceCurrencyCode: "test",
        accountingCost: 1.5,
        paymentMethodCode: "test",
        destinationCountryCode: "test",
        orderLines: [
          {
            invalidId: "test",
            passingTheTime: "awd",
          },
        ],
      },
      rl.accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await postOrder(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.message).toBe("The request body is missing mandatory fields");
  });

  test("Successful order creation returns xml", async () => {
    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testing123@gmail.com",
      "testing",
      "password",
    );
    userId2 = rl2.userId;

    const item = await insertItem({
      item_id: itemId,
      seller_id: userId,
      item_name: "new_item",
      description: "temporary description",
      price: 2.5,
      quantity_available: 200,
      image_url: "test image url",
    });

    const request = generateAuthenticatedRequest(
      "/order",
      "POST",
      {
        orderName: "test",
        buyerId: userId,
        sellerId: userId2,
        documentCurrencyCode: "aud",
        pricingCurrencyCode: "aud",
        taxCurrencyCode: "aud",
        requestedInvoiceCurrencyCode: "aud",
        accountingCost: 1.5,
        paymentMethodCode: "mastercard",
        destinationCountryCode: "AU",
        orderLines: [
          {
            itemID: itemId,
            quantity: 20,
            priceAtPurchase: 2.5,
          },
        ],
      },
      rl.accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await postOrder(request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toBe(null);
    expect(text).not.toBe(undefined);

    const converted = convert(text, { format: "object" }) as any;
    orderId = converted.Order["cbc:ID"];
  });

  test("Returns 500 on general error", async () => {
    const querySpy = spyOn(db, "createOrderQuery").mockImplementation(() => {
      throw new Error("Test");
    });

    const rl = await registerAndLogin(
      "testing@gmail.com",
      "testing",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order",
      "POST",
      {
        orderName: "test",
        buyerId: "test",
        sellerId: "test",
        documentCurrencyCode: "test",
        pricingCurrencyCode: "test",
        taxCurrencyCode: "test",
        requestedInvoiceCurrencyCode: "test",
        accountingCost: 1.5,
        paymentMethodCode: "test",
        destinationCountryCode: "test",
        orderLines: [
          {
            itemID: "test",
            quantity: 20,
            priceAtPurchase: 2.5,
          },
        ],
      },
      rl.accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${rl.accessToken}`,
    };

    const response = await postOrder(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Order creation failed");
    expect(body.error).not.toBe(undefined);

    querySpy.mockRestore();
  });
});

describe("Get orders tests", () => {
  let userId: any = null;

  afterEach(async () => {
    await deleteTestData({
      userIds: [userId],
    });
  });

  test("Invalid order id", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/orders/",
      "GET",
      {},
      rl.accessToken,
    );

    const response = await getOrder(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_ID");
    expect(body.message).toBe("The id provided is syntactically invalid");
  });

  test("Order not found", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      `/orders/${crypto.randomUUID()}`,
      "GET",
      {},
      rl.accessToken,
    );

    const response = await getOrder(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("ID_NOT_FOUND");
    expect(body.message).toBe("Id does not exist or is invalid");
  });

  test("Successfully retrieves order", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const fakeOrder = {
      order_id: "123",
      buyer_id: rl.userId,
      seller_id: "seller1",
      status: "pending",
    };

    const querySpy = spyOn(db, "getOrderById").mockResolvedValue(
      fakeOrder as any,
    );

    const request = generateAuthenticatedRequest(
      "/orders/123",
      "GET",
      {},
      rl.accessToken,
    );

    const response = await getOrder(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Order successfully retrieved");
    expect(body.order).not.toBe(undefined);

    querySpy.mockRestore();
  });

  test("Returns 500 when database throws error", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const querySpy = spyOn(db, "getOrderById").mockImplementation(() => {
      throw new Error("Database error");
    });

    const request = generateAuthenticatedRequest(
      "/orders/123",
      "GET",
      {},
      rl.accessToken,
    );

    const response = await getOrder(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("INTERNAL_ERROR");

    querySpy.mockRestore();
  });
});

describe("fullfill checkout tests", () => {
  let userId: any = null;

  afterEach(async () => {
    await deleteTestData({
      userIds: [userId],
    });
  });

  test("successful checkout fulfillment", async () => {
    const fakeIncomingSession = {
      id: "cs_test_123",
      metadata: {
        buyerId: "buyer_123",
        sellerId: "seller_456",
      },
    } as any;

    const mockExpandedSession = {
      payment_status: "paid",
      shipping_details: { address: { country: "AU" } },
      payment_intent: {
        payment_method: { type: "card", card: { brand: "visa" } },
      },
      line_items: {
        data: [
          {
            quantity: 2,
            price: {
              unit_amount: 2500, // 2500 cents = $25.00
              product: { metadata: { item_id: "item_789" } },
            },
          },
        ],
      },
    } as any;

    const retrieveSpy = spyOn(
      stripe!.checkout.sessions,
      "retrieve",
    ).mockResolvedValue(mockExpandedSession);

    const processSpy = spyOn(
      OrderApp,
      "processOrderCreation",
    ).mockResolvedValue({
      xml: "<Order></Order>",
      response: {},
    } as any);

    const result = await fulfillCheckout(fakeIncomingSession);

    expect(result).toBe(true);

    expect(retrieveSpy).toHaveBeenCalledWith("cs_test_123", {
      expand: [
        "line_items.data.price.product",
        "payment_intent.payment_method",
      ],
    });

    expect(processSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerId: "buyer_123",
        sellerId: "seller_456",
        paymentMethodCode: "visa",
        destinationCountryCode: "AU",
        orderLines: [
          {
            itemId: "item_789",
            quantity: 2,
            priceAtPurchase: 25,
            taxPercentPer: 0,
          },
        ],
      }),
    );

    retrieveSpy.mockRestore();
    processSpy.mockRestore();
  });
});

describe("delete order tests", () => {
  let userId: any = null;
  let userId2: any = null;
  let userId3: any = null;
  let orderId: any = null;

  afterEach(async () => {
    await deleteTestData({
      orderIds: [orderId].filter(Boolean),
      userIds: [userId, userId2, userId3].filter(Boolean),
    });
  });

  test("order id is invalid", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order/awkhdjakdadw/",
      "DELETE",
      {},
      rl.accessToken,
    );

    const response = await deleteOrder(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("OrderID invalid.");
    expect(body.error).toBe("Bad Request");
  });

  test("order does not exist", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      `/order/${crypto.randomUUID()}`,
      "DELETE",
      {},
      rl.accessToken,
    );

    const response = await deleteOrder(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("Order not found.");
    expect(body.error).toBe("Not Found");
  });

  test("user is not authorised to delete order", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const rl3 = await registerAndLogin(
      "testget3@gmail.com",
      "testuser",
      "password",
    );
    userId3 = rl3.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {},
      rl3.accessToken,
    );

    const response = await deleteOrder(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("User does not have permission to delete order.");
    expect(body.error).toBe("Unauthorised");
  });

  test("Successful deletion", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {},
      rl.accessToken,
    );

    const response = await deleteOrder(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Order successfully deleted");

    const query = await pg`select * from orders where order_id = ${orderId}`;
    expect(query.length).toBe(0);
  });
});

describe("get order by id tests", () => {
  let userId: any = null;
  let userId2: any = null;
  let userId3: any = null;
  let orderId: any = null;

  afterEach(async () => {
    await deleteTestData({
      orderIds: [orderId].filter(Boolean),
      userIds: [userId, userId2, userId3].filter(Boolean),
    });
  });

  test("get order id is invalid", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order/awkhdjakdadw/",
      "GET",
      {},
      rl.accessToken,
    );

    const response = await listOrder(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("OrderID invalid.");
    expect(body.error).toBe("Bad Request");
  });

  test("order does not exist to view", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      `/order/${crypto.randomUUID()}`,
      "DELETE",
      {},
      rl.accessToken,
    );

    const response = await listOrder(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("Order not found.");
    expect(body.error).toBe("Not Found");
  });

  test("user is not authorised to view order", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const rl3 = await registerAndLogin(
      "testget3@gmail.com",
      "testuser",
      "password",
    );
    userId3 = rl3.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {},
      rl3.accessToken,
    );

    const response = await listOrder(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe(
      "User does not have permission to view this order.",
    );
    expect(body.error).toBe("Unauthorised");
  });

  test("Successful retrieval", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {},
      rl.accessToken,
    );

    const response = await listOrder(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order).not.toBe(undefined);
  });
});

describe("Update order tests", () => {
  let userId: any = null;
  let userId2: any = null;
  let userId3: any = null;
  let orderId: any = null;

  afterEach(async () => {
    await deleteTestData({
      orderIds: [orderId].filter(Boolean),
      userIds: [userId, userId2, userId3].filter(Boolean),
    });
  });

  test("Order id is not provided", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      "/order/awkhdjakdadw/",
      "PUT",
      {},
      rl.accessToken,
    );

    const response = await listOrder(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
  });

  test("user is not authorised to retrieve order", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const rl3 = await registerAndLogin(
      "testget3@gmail.com",
      "testuser",
      "password",
    );
    userId3 = rl3.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {},
      rl3.accessToken,
    );

    const response = await updateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  test("Order does not exist", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const request = generateAuthenticatedRequest(
      `/order/${crypto.randomUUID()}`,
      "PUT",
      {},
      rl.accessToken,
    );

    const response = await updateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Order not found!");
  });

  test("Order updates successfully", async () => {
    const rl = await registerAndLogin(
      "testget@gmail.com",
      "testuser",
      "password",
    );
    userId = rl.userId;

    const rl2 = await registerAndLogin(
      "testget2@gmail.com",
      "testuser",
      "password",
    );
    userId2 = rl2.userId;

    const order = await insertOrder({
      buyer_id: userId,
      seller_id: userId2,
    });
    orderId = order.order_id;

    const request = generateAuthenticatedRequest(
      `/order/${orderId}`,
      "DELETE",
      {
        updates: {
          orderName: "new_name",
        },
      },
      rl.accessToken,
    );

    const response = await updateOrder(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Order update successful");

    const query =
      await pg`select order_name from orders where order_id = ${orderId}`;

    expect(query).not.toBe(null);
    expect(query[0].order_name).toBe("new_name");
  });
});
