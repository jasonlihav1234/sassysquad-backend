import pg from "../src/utils/db";
import type { User, InsertUserOverrides } from "../src/types/user";
import type { Order, InsertOrderOverrides } from "../src/types/order";

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

// Creates a random user with fields that can be overriden, and returns inputted User
export async function insertUser(
  overrides: InsertUserOverrides = {},
): Promise<User> {
  const user_id = overrides.user_id ?? crypto.randomUUID();
  const email = overrides.email ?? `test_${crypto.randomUUID()}@something.com`;
  const password_hash = overrides.password_hash ?? "random_placeholder_string";
  const user_name = overrides.user_name ?? null;
  const created_at = overrides.created_at ?? new Date();

  const rows = await pg`
    insert into users (user_id, user_name, email, password_hash, created_at)
    values (${user_id}, ${user_name}, ${email}, ${password_hash}, ${created_at})
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
  const issue_date = overrides.issue_date ?? new Date();

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
