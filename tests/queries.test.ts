import { expect, test, describe, spyOn } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  login,
  refresh,
} from "../src/application/user_application";
import { afterEach, beforeEach, mock } from "node:test";
import pg from "../src/utils/db";
import { createHash, randomBytes } from "node:crypto";
import { verifyRefreshToken } from "../src/utils/jwt_config";
import {
  createOrderQuery,
  createOrderlineQuery,
  updateOrdersById,
} from "../src/database/queries/order_queries";

// need to update this test when items queries gets added
describe("Updating orders query tests", () => {
  afterEach(async () => {
    await pg`DELETE FROM order_lines cascade`;
    await pg`DELETE FROM orders cascade`;
    await pg`DELETE FROM items`;
    await pg`DELETE FROM users cascade`;
  });

  test("Create an order and then update it", async () => {
    const buyer = "6066de3a-51fe-40e9-ba2c-1e8031997edf";
    const seller = "637a9703-663b-49b8-b01c-c7dbbab0e934";
    const buyer_email = "jasona@gmail.com";
    const seller_email = "akhjwdak@gmail.com";
    const buyer_pass = "ajwdha12dajke$jqkhw";
    const seller_pass = "ajwdha1adwa2132dajke$jqkhw";
    await pg`
      insert into users
      (user_id, email, password_hash)
      values
    (${buyer}, ${buyer_email}, ${buyer_pass})
      `;

    await pg`
      insert into users
      (user_id, email, password_hash)
      values
    (${seller}, ${seller_email}, ${seller_pass})
      `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, description, price, quantity_available, image_url, created_at, last_updated)
    values
    (${"537d8f9c-bd93-484a-b14c-ce1853456a15"}, ${seller}, 'awd', ${null}, ${10.5}, ${10000}, ${null}, ${new Date()}, ${new Date()})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, description, price, quantity_available, image_url, created_at, last_updated)
    values
    (${"99c1a581-510a-4467-91b5-112b78362f03"}, ${seller}, 'aojwd', ${null}, ${7.5}, ${10000}, ${null}, ${new Date()}, ${new Date()})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, description, price, quantity_available, image_url, created_at, last_updated)
    values
    (${"ff44b3f7-0f88-413e-b359-bb6750fb0001"}, ${seller}, 'kajdaw', ${null}, ${2.5}, ${10000}, ${null}, ${new Date()}, ${new Date()})
    `;

    const testOrderId = crypto.randomUUID(); 

    await createOrderQuery(
      testOrderId,
      "TestOrder",
      buyer,
      seller,
      "aud",
      "aud",
      "aud",
      "aud",
      5,
      "visa",
      "au",
      "textUBLStr",
      [
        {
          quantity: 20,
          priceAtPurchase: 10.5,
          itemId: "537d8f9c-bd93-484a-b14c-ce1853456a15",
        },
        {
          quantity: 10,
          priceAtPurchase: 7.5,
          itemId: "99c1a581-510a-4467-91b5-112b78362f03",
        },
        {
          quantity: 3,
          priceAtPurchase: 2.5,
          itemId: "ff44b3f7-0f88-413e-b359-bb6750fb0001",
        },
      ],
    );
    const response = await pg`select * from orders`;
    await pg`select * from order_lines`;

    const orderId = response[0].order_id;
    const status = "paid";
    const items = [
      {
        quantity: 10,
        priceAtPurchase: 10.5,
        itemId: "537d8f9c-bd93-484a-b14c-ce1853456a15",
      },
      {
        quantity: 5,
        priceAtPurchase: 7.5,
        itemId: "99c1a581-510a-4467-91b5-112b78362f03",
      },
      {
        quantity: 1,
        priceAtPurchase: 2.5,
        itemId: "ff44b3f7-0f88-413e-b359-bb6750fb0001",
      },
    ];

    // changing quantity
    expect(response.length).toBe(1);
    const test = await updateOrdersById(orderId, {
      status: status,
      items: items,
    });
    const updateResponse = await pg`select * from orders`;

    expect(updateResponse.length).toBe(1);
    expect(updateResponse[0].total_cost).not.toBe(response[0].total_cost);
  });
});
