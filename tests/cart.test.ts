import {
  addItemToCart,
  deleteItemFromCart,
  updateCartItem,
} from "../src/application/order_application";
import { expect, test, describe, spyOn, beforeAll, afterAll } from "bun:test";
import pg, { redis } from "../src/utils/db";
import { generateAuthenticatedRequest, generateRequest } from "./users.test";
import { register, login } from "../src/application/user_application";

const itemId1 = "537d8f9c-bd93-484a-b14c-ce1853456a15";
const itemId2 = "99c1a581-510a-4467-91b5-112b78362f03";
const itemId3 = "ff44b3f7-0f88-413e-b359-bb6750fb0001";
let sellerId: string | null = null;
let sellerId2: string | null = null;

describe("Add items to cart tests", () => {
  beforeAll(async () => {
    await pg`delete from items where item_id in (${itemId1})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

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

    await redis.del(`cart:${sellerId}`);

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId1}, ${sellerId2}, ${"test_item"}, ${9.5}, ${20})
    `;
  });

  afterAll(async () => {
    await pg`delete from items where item_id in (${itemId1})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
    await redis.del(`cart:${sellerId}`);
  });

  test("Item Id not provided", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        quantity: 20,
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(400);
    expect(getBody.error).toBe("Need item ID and quantity in the body");
  });

  test("Quantity not provided", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        itemId: "dioana9123hd",
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(400);
    expect(getBody.error).toBe("Need item ID and quantity in the body");
  });

  test("Item does not exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        itemId: crypto.randomUUID(),
        quantity: 200,
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.error).toBe("Item does not exist");
  });

  test("Quantity more large than available", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        itemId: itemId1,
        quantity: 2000000000000,
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(400);
    expect(getBody.error).toBe("Not enough items in stock");
  });

  test("Item successfully added to cart", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        itemId: itemId1,
        quantity: 20,
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Item successfully added to cart");

    const query = await redis.hget(`cart:${sellerId}`, itemId1);

    expect(query).not.toBe(null);
  });

  test("Invalid item Id inputted", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items`,
      "POST",
      {
        itemId: ":adhaanwd",
        quantity: 1,
      },
      accessToken,
    );

    const getResponse = await addItemToCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(500);
    expect(getBody.message).toBe("Item failed to add to cart");
  });
});

describe("Deleting item from carts tests", () => {
  beforeAll(async () => {
    await pg`delete from items where item_id in (${itemId1})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

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

    await redis.del(`cart:${sellerId}`);

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId1}, ${sellerId2}, ${"test_item"}, ${9.5}, ${20})
    `;

    if (sellerId !== null) {
      await redis.hset(`cart:${sellerId}`, itemId1, (100).toString());
    }
  });

  afterAll(async () => {
    await pg`delete from items where item_id in (${itemId1})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
    await redis.del(`cart:${sellerId}`);
  });

  test("Successfully deletes all items", async () => {
    await redis.hset(`cart:${sellerId}`, itemId2, (300).toString());
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart`,
      "DELETE",
      {},
      accessToken,
    );

    const getResponse = await deleteItemFromCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Item/s successfully removed from cart");

    const res = await redis.hkeys(`cart:${sellerId}`);
    expect(res.length).toBe(0);

    await redis.hset(`cart:${sellerId}`, itemId1, (100).toString());
  });

  test("Successfully deletes a singular item", async () => {
    await redis.hset(`cart:${sellerId}`, itemId2, (300).toString());
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items/${itemId2}`,
      "DELETE",
      {},
      accessToken,
    );

    const getResponse = await deleteItemFromCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Item/s successfully removed from cart");

    const res = await redis.hkeys(`cart:${sellerId}`);
    expect(res.length).not.toBe(0);
  });

  test("No items in cart for user", async () => {
    await redis.hdel(`cart:${sellerId}`, itemId1);
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart`,
      "DELETE",
      {},
      accessToken,
    );

    const getResponse = await deleteItemFromCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("No items in the cart to delete");
  });

  test("Deleting item in cart that does not exist", async () => {
    await redis.hdel(`cart:${sellerId}`, itemId1);
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/cart/items/${itemId1}`,
      "DELETE",
      {},
      accessToken,
    );

    const getResponse = await deleteItemFromCart(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Item does not exist in the cart to delete");
  });

  // impossible to test 500 path unless backend crashes
});
