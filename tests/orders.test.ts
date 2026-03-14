import { describe, expect } from "bun:test";
import pg, { redis } from "../src/utils/db";
import test, { beforeEach } from "node:test";
import {
  generateAuthenticatedRequest,
  registerAndLogin,
  resetDb,
} from "./test_helper";
import { createCheckoutSession } from "../src/application/order_application";
import { randomBytes } from "node:crypto";

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
