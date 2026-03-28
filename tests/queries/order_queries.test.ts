import { describe, test, expect } from "bun:test";
import pg from "../../src/utils/db";
import {
  insertUser,
  insertOrder,
  insertItem,
  deleteTestData,
  createBuyerAndSeller,
} from "../test_helper";
import {
  getOrderIdByName,
  getOrderById,
  createOrderQuery,
  createOrderlineQuery,
  getOrdersByUserId,
  deleteOrdersById,
  updateOrdersById,
  createItem,
  editItem,
  deleteItem,
} from "../../src/database/queries/order_queries";

describe("getOrderIdByName", () => {
  test("returns null when no order has the given name", async () => {
    const result = await getOrderIdByName("nonexistent-order-name");
    expect(result).toBeNull();
  });

  test("returns order_id when order with given name exists", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const orderName = `order-${crypto.randomUUID()}`;
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
      order_name: orderName,
    });

    const result = await getOrderIdByName(orderName);

    expect(result).toBe(order.order_id);

    await deleteTestData({
      orderIds: [order.order_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});

describe("getOrderById", () => {
  test("returns null when order does not exist", async () => {
    const result = await getOrderById(crypto.randomUUID());
    expect(result).toBeNull();
  });

  test("returns order when order exists", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });

    const result = await getOrderById(order.order_id);

    expect(result).not.toBeNull();
    expect(result!.order_id).toBe(order.order_id);
    expect(result!.order_name).toBe(order.order_name);
    expect(result!.buyer_id).toBe(buyer.user_id);
    expect(result!.seller_id).toBe(seller.user_id);

    await deleteTestData({
      orderIds: [order.order_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});

describe("createOrderQuery", () => {
  test("creates order with mastercard payment method", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `createOrder-mastercard-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const quantity = 2;
    const priceAtPurchase = 10;
    const totalItemCost = quantity * priceAtPurchase;
    const expectedPaymentMethodCost = totalItemCost * (0.5 / 100); // mastercard rate

    const res = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "mastercard",
      "AU",
      "",
      [{ itemId: item.item_id, quantity, priceAtPurchase }],
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Insertion successful");
    expect(body.orderId).toBe(orderId);

    const rows =
      await pg`select payment_method_cost from orders where order_id = ${orderId}`;
    expect(rows.length).toBe(1);
    expect(Number(rows[0].payment_method_cost)).toBe(expectedPaymentMethodCost);

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("creates order with default payment method (non visa/mastercard)", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `createOrder-default-pm-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const quantity = 2;
    const priceAtPurchase = 10;
    const totalItemCost = quantity * priceAtPurchase;
    const expectedPaymentMethodCost = totalItemCost * (1.4 / 100); // default rate

    const res = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "amex",
      "AU",
      "",
      [{ itemId: item.item_id, quantity, priceAtPurchase }],
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Insertion successful");
    const rows =
      await pg`select payment_method_cost from orders where order_id = ${orderId}`;
    expect(rows.length).toBe(1);
    expect(Number(rows[0].payment_method_cost)).toBeCloseTo(
      expectedPaymentMethodCost,
      10,
    );

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("returns 400 when item has insufficient inventory", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `createOrder-low-qty-${crypto.randomUUID()}`,
      quantity_available: 2,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;

    const res = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      [{ itemId: item.item_id, quantity: 10, priceAtPurchase: 10 }],
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error_msg).toContain("Insufficient inventory");
    expect(body.error_msg).toContain(item.item_id);

    const orders = await pg`select * from orders where order_id = ${orderId}`;
    expect(orders.length).toBe(0);

    await deleteTestData({
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("returns 500 when insertion fails with non-inventory error", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `createOrder-dup-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const items = [{ itemId: item.item_id, quantity: 1, priceAtPurchase: 10 }];

    const res1 = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      items,
    );
    expect(res1.status).toBe(200);

    const res2 = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      items,
    );
    const body = await res2.json();

    expect(res2.status).toBe(500);
    expect(body.error_msg).toBe("Insertion failed");

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});

describe("createOrderlineQuery", () => {
  test("returns total item price and creates order line when order and item exist", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
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
    const { buyer, seller } = await createBuyerAndSeller();
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

  test("returns 500 when delete fails", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });
    const item = await insertItem({ seller_id: seller.user_id });

    await createOrderlineQuery(order.order_id, item.item_id, 1, 0, 10);

    const res = await deleteOrdersById(order.order_id);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toBe("Order deletion failed");

    await deleteTestData({
      orderIds: [order.order_id],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});

describe("updateOrdersById", () => {
  test("create an order and then update it", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item1 = await insertItem({
      seller_id: seller.user_id,
      item_name: `create-update-1-${crypto.randomUUID()}`,
      price: 10.5,
      quantity_available: 10000,
    });
    const item2 = await insertItem({
      seller_id: seller.user_id,
      item_name: `create-update-2-${crypto.randomUUID()}`,
      price: 7.5,
      quantity_available: 10000,
    });
    const item3 = await insertItem({
      seller_id: seller.user_id,
      item_name: `create-update-3-${crypto.randomUUID()}`,
      price: 2.5,
      quantity_available: 10000,
    });

    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const createRes = await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      [
        { itemId: item1.item_id, quantity: 20, priceAtPurchase: 10.5 },
        { itemId: item2.item_id, quantity: 10, priceAtPurchase: 7.5 },
        { itemId: item3.item_id, quantity: 3, priceAtPurchase: 2.5 },
      ],
    );
    expect(createRes.status).toBe(200);

    const [orderBefore] =
      await pg`select * from orders where order_id = ${orderId}`;

    const updateRes = await updateOrdersById(orderId, {
      status: "paid",
      items: [
        { itemId: item1.item_id, quantity: 10, priceAtPurchase: 10.5 },
        { itemId: item2.item_id, quantity: 5, priceAtPurchase: 7.5 },
        { itemId: item3.item_id, quantity: 1, priceAtPurchase: 2.5 },
      ],
    });
    const updateBody = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateBody.message).toBe("Update successful");

    const [orderAfter] =
      await pg`select * from orders where order_id = ${orderId}`;
    expect(Number(orderAfter.total_cost)).not.toBe(
      Number(orderBefore.total_cost),
    );

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item1.item_id, item2.item_id, item3.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("returns 400 when increasing item quantity beyond available", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `update-not-enough-${crypto.randomUUID()}`,
      quantity_available: 10,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      [{ itemId: item.item_id, quantity: 2, priceAtPurchase: 10 }],
    );
    await pg`
      update items set quantity_available = 3 where item_id = ${item.item_id}
    `;

    const res = await updateOrdersById(orderId, {
      items: [{ itemId: item.item_id, quantity: 10, priceAtPurchase: 10 }],
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Not enough quantity");

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("updates order with mastercard payment method", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `update-mastercard-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const items = [{ itemId: item.item_id, quantity: 2, priceAtPurchase: 10 }];
    await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      items,
    );

    const res = await updateOrdersById(orderId, {
      paymentMethodCode: "mastercard",
      items,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Update successful");
    const rows =
      await pg`select payment_method_cost from orders where order_id = ${orderId}`;
    const expectedCost = 20 * (0.5 / 100);
    expect(Number(rows[0].payment_method_cost)).toBe(expectedCost);

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("updates order with default payment method", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `update-default-pm-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const items = [{ itemId: item.item_id, quantity: 2, priceAtPurchase: 10 }];
    await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      items,
    );

    const res = await updateOrdersById(orderId, {
      paymentMethodCode: "amex",
      items,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Update successful");
    const rows =
      await pg`select payment_method_cost from orders where order_id = ${orderId}`;
    const expectedCost = 20 * (1.4 / 100);
    expect(Number(rows[0].payment_method_cost)).toBeCloseTo(expectedCost, 10);

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });

  test("returns 500 when order does not exist", async () => {
    const res = await updateOrdersById(crypto.randomUUID(), {
      status: "paid",
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error_msg).toBe("Update failed");
  });

  test("updates only status without items, uses existing order totals for totalCost", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `update-status-only-${crypto.randomUUID()}`,
      quantity_available: 100,
    });
    const orderId = crypto.randomUUID();
    const orderName = `order-${orderId}`;
    const items = [{ itemId: item.item_id, quantity: 2, priceAtPurchase: 10 }];
    await createOrderQuery(
      orderId,
      orderName,
      buyer.user_id,
      seller.user_id,
      "AUD",
      "AUD",
      "AUD",
      "AUD",
      0,
      "visa",
      "AU",
      "",
      items,
    );

    const res = await updateOrdersById(orderId, { status: "paid" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Update successful");
    const rows =
      await pg`select status, total_cost from orders where order_id = ${orderId}`;
    expect(rows[0].status).toBe("paid");

    await deleteTestData({
      orderIds: [orderId],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});

describe("createItem", () => {
  test("inserts item and returns 200 with message", async () => {
    const seller = await insertUser();
    const itemName = `createItem-test-${crypto.randomUUID()}`;

    const res = await createItem(seller.user_id, itemName, null, 10, 100, null);
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

  test("returns 404 when item does not exist to delete", async () => {
    const { buyer, seller } = await createBuyerAndSeller();
    const order = await insertOrder({
      buyer_id: buyer.user_id,
      seller_id: seller.user_id,
    });
    const item = await insertItem({ seller_id: seller.user_id });

    await createOrderlineQuery(order.order_id, item.item_id, 1, 0, 10);
    const res = await deleteItem(crypto.randomUUID());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.message).toBe("Item not found");
    // need to delete order line as well
    await deleteTestData({
      orderIds: [order.order_id],
      itemIds: [item.item_id],
      userIds: [buyer.user_id, seller.user_id],
    });
  });
});
