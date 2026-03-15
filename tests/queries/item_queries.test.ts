import { describe, test, expect } from "bun:test";
import { getItemIdByName } from "../../src/database/queries/item_queries";
import { insertUser, insertItem, deleteTestData } from "../test_helper";

describe("getItemIdByName", () => {
  test("returns null when no item has the given name", async () => {
    const result = await getItemIdByName("nonexistent-item-name");
    expect(result).toBeNull();
  });

  test("returns item_id when item with given name exists", async () => {
    const seller = await insertUser();
    const itemName = `item-${crypto.randomUUID()}`;
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: itemName,
    });

    const result = await getItemIdByName(itemName);

    expect(result).toBe(item.item_id);

    await deleteTestData({
      itemIds: [item.item_id],
      userIds: [seller.user_id],
    });
  });
});
