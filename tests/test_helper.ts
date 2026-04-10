import { expect } from "bun:test";
import pg from "../src/utils/db";
import type { User, InsertUserOverrides } from "../src/types/user";
import type { Order, InsertOrderOverrides } from "../src/types/order";
import type { InsertItemOverrides } from "../src/types/item";
import type { DeleteTestDataOptions } from "../src/types/combined_types";
import { register, login } from "../src/application/user_application";

// Resets DB
export async function resetDb(): Promise<void> {
  await pg`truncate table order_lines restart identity cascade`;
  await pg`truncate table orders restart identity cascade`;
  await pg`truncate table items restart identity cascade`;
  await pg`truncate table refresh_tokens restart identity cascade`;
  await pg`truncate table users restart identity cascade`;
}

export const generateRequest = (
  url: string,
  givenMethod: string,
  givenBody: any,
): any => {
  return {
    url: url,
    method: givenMethod,
    headers: {
      "content-type": "application/json",
    },
    body: givenBody,
    json: async () => givenBody,
  };
};

export const generateAuthenticatedRequest = (
  url: string,
  givenMethod: string,
  givenBody: any,
  token: any,
): any => {
  return {
    url: url,
    method: givenMethod,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: givenBody,
    json: async () => givenBody,
  };
};

const registerRoute = "http://localhost/auth/register";
const loginRoute = "http://localhost/auth/login";

/** Register a user and log in; returns userId and accessToken for authenticated requests. */
export async function registerAndLogin(
  email: string,
  username: string,
  password: string,
): Promise<{ userId: string; accessToken: string }> {
  const registerRes = await register(
    generateRequest(registerRoute, "POST", { email, username, password }),
  );
  const registerBody = await registerRes.json();
  expect(registerRes.status).toBe(201);
  const userId = registerBody.user;
  const loginRes = await login(
    generateRequest(loginRoute, "POST", { email, password }),
  );
  const loginBody = await loginRes.json();
  expect(loginRes.status).toBe(200);
  return { userId, accessToken: loginBody.accessToken };
}

/** Register a user only; returns userId. */
export async function registerOnly(
  email: string,
  username: string,
  password: string,
): Promise<{ userId: string }> {
  const registerRes = await register(
    generateRequest(registerRoute, "POST", { email, username, password }),
  );
  const registerBody = await registerRes.json();
  expect(registerRes.status).toBe(201);
  return { userId: registerBody.user };
}

// Creates a random user with fields that can be overriden, and returns inputted User
export async function insertUser(
  overrides: InsertUserOverrides = {},
): Promise<User> {
  const user_id = overrides.user_id ?? crypto.randomUUID();
  const email = overrides.email ?? `test_${crypto.randomUUID()}@something.com`;
  const password_hash = overrides.password_hash ?? "random_placeholder_string";
  const user_name = overrides.user_name ?? null;
  const biography = overrides.biography ?? null;
  const created_at = overrides.created_at ?? new Date();

  const rows = await pg`
    insert into users (user_id, user_name, biography, email, password_hash, created_at)
    values (${user_id}, ${user_name}, ${biography}, ${email}, ${password_hash}, ${created_at})
    returning *
  `;

  return rows[0] as User;
}

// Creates a random user with fields that can be overriden, and returns inputted Order
export async function insertOrder(overrides: InsertOrderOverrides) {
  const order_id = overrides.order_id ?? crypto.randomUUID();
  const order_name = overrides.order_name ?? `order_${crypto.randomUUID()}`;
  const buyer_id = overrides.buyer_id;
  const seller_id = overrides.seller_id;
  const rawDate = overrides.issue_date ?? new Date();
  const issue_date =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : new Date(rawDate).toISOString().slice(0, 10);

  if (!buyer_id || !seller_id) {
    throw new Error("Buyer and Seller id must be specified in insertOrder()");
  }

  const status = overrides.status ?? null;
  const ubl_xml_content = overrides.ubl_xml_content ?? null;

  const rows = await pg`
    insert into orders (
      order_id,
      order_name,
      buyer_id,
      seller_id,
      issue_date,
      status,
      ubl_xml_content
    )
    values (
      ${order_id},
      ${order_name},
      ${buyer_id},
      ${seller_id},
      ${issue_date},
      ${status},
      ${ubl_xml_content}
    )
    returning *
  `;

  return rows[0] as Order;
}

export async function insertItem(overrides: InsertItemOverrides): Promise<{
  item_id: string;
  seller_id: string;
  item_name: string;
  description: string | null;
  price: number;
  quantity_available: number;
  image_url: string | null;
}> {
  const item_id = overrides.item_id ?? crypto.randomUUID();
  const item_name = overrides.item_name ?? "test_item";
  const description = overrides.description ?? null;
  const price = overrides.price ?? 10;
  const quantity_available = overrides.quantity_available ?? 100;
  const image_url = overrides.image_url ?? null;

  const rows = await pg`
    insert into items (item_id, seller_id, item_name, description, price, quantity_available, image_url, created_at, last_updated)
    values (${item_id}, ${overrides.seller_id}, ${item_name}, ${description}, ${price}, ${quantity_available}, ${image_url}, ${new Date()}, ${new Date()})
    returning item_id, seller_id, item_name, description, price, quantity_available, image_url
  `;
  return rows[0] as {
    item_id: string;
    seller_id: string;
    item_name: string;
    description: string | null;
    price: number;
    quantity_available: number;
    image_url: string | null;
  };
}

// Create a buyer and seller for query/order tests (no auth)
export async function createBuyerAndSeller(opts?: {
  buyerOverrides?: InsertUserOverrides;
  sellerOverrides?: InsertUserOverrides;
}): Promise<{ buyer: User; seller: User }> {
  const buyer = await insertUser(opts?.buyerOverrides);
  const seller = await insertUser(opts?.sellerOverrides);
  return { buyer, seller };
}

// Create purchases from random sellers
export async function seedUserWithRandomBuyerOrders(
  orderCount: number,
): Promise<{ user: User; orders: Order[] }> {
  const user = await insertUser();
  const orders: Order[] = [];
  for (let i = 0; i < orderCount; i++) {
    const order = await insertOrder({
      buyer_id: user.user_id,
      seller_id: crypto.randomUUID(),
    });
    orders.push(order);
  }
  return { user, orders };
}

// Create sales from random buyers
export async function seedUserWithSellerOrders(
  orderCount: number,
): Promise<{ user: User; orders: Order[] }> {
  const user = await insertUser();
  const orders: Order[] = [];
  for (let i = 0; i < orderCount; i++) {
    const order = await insertOrder({
      buyer_id: crypto.randomUUID(),
      seller_id: user.user_id,
    });
    orders.push(order);
  }
  return { user, orders };
}

// Deletes test data by user_id, item_id, order_id
export async function deleteTestData(
  opts: DeleteTestDataOptions,
): Promise<void> {
  if (opts.orderIds?.length) {
    for (const orderId of opts.orderIds) {
      console.log(orderId);
      await pg`delete from order_lines where order_id = ${orderId}`;
    }
  }
  if (opts.itemIds?.length) {
    for (const itemId of opts.itemIds) {
      await pg`delete from items where item_id = ${itemId}`;
    }
  }
  if (opts.orderIds?.length) {
    for (const orderId of opts.orderIds) {
      await pg`delete from orders where order_id = ${orderId}`;
    }
  }
  if (opts.userIds?.length) {
    for (const userId of opts.userIds) {
      await pg`delete from users where user_id = ${userId}`;
    }
  }
}
