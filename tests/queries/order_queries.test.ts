import { describe, test, expect } from "bun:test";
import pg from "../../src/utils/db";
import {
  insertUser,
  insertOrder,
  insertItem,
  deleteTestData,
} from "../test_helper";
import {
  createOrderlineQuery,
  getOrdersByUserId,
  deleteOrdersById,
  createItem,
  editItem,
  deleteItem,
} from "../../src/database/queries/order_queries";

describe("createOrderlineQuery", () => {
  test("returns total item price and creates order line when order and item exist", async () => {
    const buyer = await insertUser();
    const seller = await insertUser();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });
    const item = await insertItem({ seller_id: seller.user_id });

    const quantity = 3;
    const priceAtPurchase = 10.5;
    const expectedTotal = priceAtPurchase * quantity;

    const result = await createOrderlineQuery(
      order.order_id,
      item.item_id,
      quantity,
      0,
      priceAtPurchase,
    );

    expect(result).toBe(expectedTotal);

    const lines = await pg`
      select * from order_lines
      where order_id = ${order.order_id} and item_id = ${item.item_id}
    `;
    expect(lines.length).toBe(1);
    expect(Number(lines[0].quantity)).toBe(quantity);
    expect(Number(lines[0].price_at_purchase)).toBe(priceAtPurchase);

    await deleteTestData({
      orderIds: [order.order_id],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("returns null when insert fails", async () => {
    const result = await createOrderlineQuery(
      crypto.randomUUID(),
      crypto.randomUUID(),
      1,
      0,
      10,
    );
    expect(result).toBeNull();
  });
});

describe("getOrdersByUserId", () => {
  test("returns user rows for existing user id", async () => {
    const user = await insertUser();

    const result = await getOrdersByUserId(user.user_id);

    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].user_id).toBe(user.user_id);
    expect(result![0].email).toBe(user.email);

    await deleteTestData({ userIds: [user.user_id] });
  });

  test("returns empty array when user id does not exist", async () => {
    const result = await getOrdersByUserId(crypto.randomUUID());

    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBe(0);
  });
});

describe("deleteOrdersById", () => {
  test("deletes order and returns 200 with message", async () => {
    const buyer = await insertUser();
    const seller = await insertUser();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });

    const res = await deleteOrdersById(order.order_id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Order deleted");

    const remaining = await pg`
      select * from orders where order_id = ${order.order_id}
    `;
    expect(remaining.length).toBe(0);

    await deleteTestData({ userIds: [buyer.user_id, seller.user_id] });
  });
});

describe("createItem", () => {
  test("inserts item and returns 200 with message", async () => {
    const seller = await insertUser();
    const itemName = `createItem-test-${crypto.randomUUID()}`;

    const res = await createItem(
      seller.user_id,
      itemName,
      null,
      10,
      100,
      null,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Order created");

    const rows = await pg`
      select item_id from items where seller_id = ${seller.user_id} and item_name = ${itemName}
    `;
    expect(rows.length).toBe(1);

    await deleteTestData({
      itemIds: [rows[0].item_id],
      userIds: [seller.user_id],
    });
  });

  test("returns 500 when insert fails", async () => {
    const res = await createItem(
      crypto.randomUUID(),
      "test-item",
      null,
      10,
      100,
      null,
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Order failed to create");
  });
});

describe("editItem", () => {
  test("returns 200 with no-update message when all fields are null", async () => {
    const seller = await insertUser();
    const item = await insertItem({ seller_id: seller.user_id });

    const res = await editItem(
      item.item_id,
      null,
      null,
      null,
      null,
      null,
      null,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("No values to update for items");

    await deleteTestData({
      itemIds: [item.item_id],
      userIds: [seller.user_id],
    });
  });

  test("updates item and returns 200 with success message", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: "original-name",
    });

    const res = await editItem(
      item.item_id,
      null,
      "updated-name",
      null,
      null,
      null,
      null,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Item successfully updated");

    const rows = await pg`
      select item_name from items where item_id = ${item.item_id}
    `;
    expect(rows[0].item_name).toBe("updated-name");

    await deleteTestData({
      itemIds: [item.item_id],
      userIds: [seller.user_id],
    });
  });

  test("returns 500 when update fails", async () => {
    const seller = await insertUser();
    const item = await insertItem({ seller_id: seller.user_id });

    const res = await editItem(
      item.item_id,
      crypto.randomUUID(),
      null,
      null,
      null,
      null,
      null,
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toBe("Item update failed");

    await deleteTestData({
      itemIds: [item.item_id],
      userIds: [seller.user_id],
    });
  });
});

describe("deleteItem", () => {
  test("returns 400 when itemId is empty", async () => {
    const res = await deleteItem("");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No itemId provided");
  });

  test("deletes item and returns 200 with message", async () => {
    const seller = await insertUser();
    const item = await insertItem({ seller_id: seller.user_id });

    const res = await deleteItem(item.item_id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Item deleted");

    const rows = await pg`select * from items where item_id = ${item.item_id}`;
    expect(rows.length).toBe(0);

    await deleteTestData({ userIds: [seller.user_id] });
  });

  test("returns 500 when delete fails", async () => {
    const buyer = await insertUser();
    const seller = await insertUser();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });
    const item = await insertItem({ seller_id: seller.user_id });

    await createOrderlineQuery(
      order.order_id,
      item.item_id,
      1,
      0,
      10,
    );

    const res = await deleteItem(item.item_id);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toBe("Item failed to delete");

    await deleteTestData({
      orderIds: [order.order_id],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});
