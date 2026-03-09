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
} from "../src/database/queries/order_queries";

describe("Updating orders query tests", () => {
  afterEach(async () => {
    await pg`DELETE FROM order_lines`;
    await pg`DELETE FROM orders`;
    await pg`DELETE FROM users`;
  });

  test("Create an order and then update it", async () => {
    const buyer = crypto.randomUUID();
    const seller = crypto.randomUUID();
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

    await createOrderQuery(
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
    const res_2 = await pg`select * from order_lines`;

    console.log(response);
    console.log(res_2);
  });
});
