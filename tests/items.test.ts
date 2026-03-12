import { expect, test, describe, spyOn, beforeAll, afterAll } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  refresh,
  login,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
} from "../src/application/user_application";
import { afterEach, beforeEach, mock } from "node:test";
import pg, { redis } from "../src/utils/db";
import { createHash } from "node:crypto";
import { verifyRefreshToken } from "../src/utils/jwt_config";
import { getMaxListeners } from "node:cluster";
import { sleep } from "bun";
import {
  getItemsById,
  getAllItems,
  getItemByUserId,
} from "../src/application/item_application";
import { generateAuthenticatedRequest, generateRequest } from "./users.test";

const itemId1 = "537d8f9c-bd93-484a-b14c-ce1853456a15";
const itemId2 = "99c1a581-510a-4467-91b5-112b78362f03";
const itemId3 = "ff44b3f7-0f88-413e-b359-bb6750fb0001";
let sellerId: string | null = null;
let sellerId2: string | null = null;

beforeAll(async () => {
  // register users
  await pg`delete from refresh_tokens`;
  await pg`delete from items`;
  await pg`delete from users`;

  const registerReq = generateRequest(
    "http://localhost/auth/register",
    "POST",
    {
      email: "jasonli1234@gmail.com",
      username: "test",
      password: "testing123",
    },
  );

  const registerReq2 = generateRequest(
    "http://localhost/auth/register",
    "POST",
    {
      email: "jasonli8909@gmail.com",
      username: "test2",
      password: "testing123",
    },
  );

  const userRes = await register(registerReq);
  const userRes2 = await register(registerReq2);
  sellerId = (await userRes.json()).user;
  sellerId2 = (await userRes2.json()).user;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId1}, ${sellerId}, ${"test_item"}, ${9.5}, ${20})
  `;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId2}, ${sellerId2}, ${"test_item2"}, ${2.5}, ${10})
  `;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId3}, ${sellerId}, ${"test_item3"}, ${10.5}, ${25})
  `;
});

afterAll(async () => {
  // delete all registered users
  await pg`delete from refresh_tokens`;
  await pg`delete from items`;
  await pg`delete from users`;
});

describe("Getting items tests", () => {
  test("Getting item by item id", async () => {
    const test = await pg`select * from users`;
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${itemId1}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items found");
    expect(getBody.items.length).toBe(1);
    expect(getBody.items[0].item_name).toBe("test_item");
    expect(getBody.items[0].quantity_available).toBe(20);
  });

  test("Getting item that does not exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${crypto.randomUUID()}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item with invalid item UUID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${"kjawbdkan"}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(500);
    expect(getBody.message).toBe("Items fetch failed");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item by user ID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${sellerId}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items found");
    expect(getBody.items.length).toBe(2);
  });

  test("Getting non-existing item by user ID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${crypto.randomUUID()}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item with invalid user UUID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${"alkwndakldnad"}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(500);
    expect(getBody.message).toBe("Getting items by user id failed");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting all items that exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getAllItems(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items successfully fetched");
    expect(getBody.items.length).toBe(3);
  });

  test("Getting all items, no items exist", async () => {
    await pg`delete from items`;
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getAllItems(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });
});