import { describe, expect, spyOn } from "bun:test";
import pg, { redis } from "../../src/utils/db";
import test, { beforeEach } from "node:test";
import {
  generateAuthenticatedRequest,
  registerAndLogin,
  resetDb,
} from "../test_helper";
import {
  checkCheckoutSessionStatus,
  createCheckoutSession,
  serverWebhook,
} from "../../src/application/order_application";
import * as OrderApp from "../../src/application/order_application";
import Stripe from "stripe";

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
