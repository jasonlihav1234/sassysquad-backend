import { describe, test, expect } from "bun:test";
import {
  getItemIdByName,
  createItemQueryV2,
  updateItemQueryV2,
  addItemTagsQuery,
  deleteItemTagsQuery,
  createReviewQuery,
} from "../../src/database/queries/item_queries";
import { insertUser, insertItem, deleteTestData } from "../test_helper";
import pg from "../../src/utils/db";

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

describe("createItemQueryV2", () => {
  test("inserts item with category and lower-cased tags", async () => {
    const seller = await insertUser();
    const itemId = crypto.randomUUID();
    const tagSuffix = crypto.randomUUID().slice(0, 8);
    const categoryName = `Category-${crypto.randomUUID()}`;
    const tags = [`Modern-${tagSuffix}`, `Minimalist-${tagSuffix}`];
    const expectedLowerTags = tags.map((tag) => tag.toLowerCase()).sort();

    try {
      const createdItem: any = await createItemQueryV2(
        itemId,
        seller.user_id,
        "query-v2-item",
        "query-v2-description",
        99.99,
        8,
        "https://example.com/item.png",
        categoryName,
        tags,
      );

      expect(createdItem.item_id).toBe(itemId);
      expect(createdItem.seller_id).toBe(seller.user_id);
      expect(createdItem.item_name).toBe("query-v2-item");
      expect(Number(createdItem.price)).toBe(99.99);
      expect(Number(createdItem.quantity_available)).toBe(8);

      const categoryRows = await pg`
        select category_name from categories where category_id = ${createdItem.category_id}
      `;
      expect(categoryRows.length).toBe(1);
      expect(categoryRows[0].category_name).toBe(categoryName.toLowerCase());

      const mappedTags = await pg`
        select t.tag_name
        from item_tags it
        join tags t on t.tag_id = it.tag_id
        where it.item_id = ${itemId}
        order by t.tag_name asc
      `;
      expect(mappedTags.length).toBe(2);
      expect(mappedTags[0].tag_name).toBe(expectedLowerTags[0]);
      expect(mappedTags[1].tag_name).toBe(expectedLowerTags[1]);
    } finally {
      await pg`
        delete from item_tags
        where item_id = ${itemId}
      `;
      await deleteTestData({
        itemIds: [itemId],
        userIds: [seller.user_id],
      });
      await pg`delete from categories where category_name = ${categoryName.toLowerCase()}`;
      await pg`delete from tags where tag_name in ${pg(expectedLowerTags)}`;
    }
  }, 15000);

  test("throws when tags are empty", async () => {
    const seller = await insertUser();
    const itemId = crypto.randomUUID();
    const categoryName = `Category-${crypto.randomUUID()}`;

    try {
      await expect(
        createItemQueryV2(
          itemId,
          seller.user_id,
          "query-v2-invalid",
          null,
          15,
          1,
          null,
          categoryName,
          [],
        ),
      ).rejects.toThrow("No tags provided for item");
    } finally {
      await deleteTestData({
        userIds: [seller.user_id],
      });
      await pg`delete from categories where category_name = ${categoryName.toLowerCase()}`;
    }
  });
});

describe("updateItemQueryV2", () => {
  test("updates item fields and upserts category when categoryName is provided", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: "query-update-before",
      description: "before-desc",
      price: 20,
      quantity_available: 3,
      image_url: "https://example.com/before.png",
    });
    const categoryName = `UpdatedCategory-${crypto.randomUUID()}`;

    try {
      const updatedItem: any = await updateItemQueryV2(
        item.item_id,
        "query-update-after",
        "after-desc",
        45,
        17,
        "https://example.com/after.png",
        categoryName,
      );

      expect(updatedItem.item_id).toBe(item.item_id);
      expect(updatedItem.item_name).toBe("query-update-after");
      expect(updatedItem.description).toBe("after-desc");
      expect(Number(updatedItem.price)).toBe(45);
      expect(Number(updatedItem.quantity_available)).toBe(17);
      expect(updatedItem.image_url).toBe("https://example.com/after.png");

      const categoryRows = await pg`
        select category_name from categories where category_id = ${updatedItem.category_id}
      `;
      expect(categoryRows.length).toBe(1);
      expect(categoryRows[0].category_name).toBe(categoryName.toLowerCase());
    } finally {
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
      await pg`delete from categories where category_name = ${categoryName.toLowerCase()}`;
    }
  }, 15000);

  test("keeps category unchanged when categoryName is null", async () => {
    const seller = await insertUser();
    const existingCategoryName =
      `ExistingCategory-${crypto.randomUUID()}`.toLowerCase();
    const insertedCategory = await pg`
      insert into categories (category_id, category_name)
      values (${crypto.randomUUID()}, ${existingCategoryName})
      returning category_id
    `;
    const existingCategoryId = insertedCategory[0].category_id as string;

    const itemRows = await pg`
      insert into items (item_id, seller_id, item_name, description, price, quantity_available, image_url, category_id, created_at, last_updated)
      values (${crypto.randomUUID()}, ${seller.user_id}, ${"query-update-existing-category"}, ${"desc"}, ${11}, ${2}, ${"https://example.com/img.png"}, ${existingCategoryId}, ${new Date()}, ${new Date()})
      returning item_id
    `;
    const itemId = itemRows[0].item_id as string;

    try {
      const updatedItem: any = await updateItemQueryV2(
        itemId,
        "updated-name-no-category-change",
        "updated-desc-no-category-change",
        33,
        6,
        "https://example.com/new-img.png",
        null,
      );

      expect(updatedItem.item_id).toBe(itemId);
      expect(updatedItem.category_id).toBe(existingCategoryId);
      expect(updatedItem.item_name).toBe("updated-name-no-category-change");
      expect(Number(updatedItem.price)).toBe(33);
    } finally {
      await deleteTestData({
        itemIds: [itemId],
        userIds: [seller.user_id],
      });
      await pg`delete from categories where category_id = ${existingCategoryId}`;
    }
  }, 15000);
});

describe("addItemTagsQuery", () => {
  test("returns early when tags are empty", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `add-tags-empty-${crypto.randomUUID()}`,
    });

    try {
      await addItemTagsQuery(item.item_id, []);

      const mappings = await pg`
        select * from item_tags where item_id = ${item.item_id}
      `;
      expect(mappings.length).toBe(0);
    } finally {
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
    }
  }, 15000);

  test("inserts tags and avoids duplicate mappings on repeated calls", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `add-tags-repeat-${crypto.randomUUID()}`,
    });
    const tagSuffix = crypto.randomUUID().slice(0, 8);
    const tags = [`Modern-${tagSuffix}`, `Minimalist-${tagSuffix}`];
    const expectedLowerTags = tags.map((tag) => tag.toLowerCase()).sort();

    try {
      await addItemTagsQuery(item.item_id, tags);
      await addItemTagsQuery(item.item_id, tags);

      const mappings = await pg`
        select t.tag_name
        from item_tags it
        join tags t on t.tag_id = it.tag_id
        where it.item_id = ${item.item_id}
        order by t.tag_name asc
      `;
      expect(mappings.length).toBe(2);
      expect(mappings[0].tag_name).toBe(expectedLowerTags[0]);
      expect(mappings[1].tag_name).toBe(expectedLowerTags[1]);
    } finally {
      await pg`delete from item_tags where item_id = ${item.item_id}`;
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
      await pg`delete from tags where tag_name in ${pg(expectedLowerTags)}`;
    }
  }, 15000);
});

describe("deleteItemTagsQuery", () => {
  test("returns early when tags are empty", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `delete-tags-empty-${crypto.randomUUID()}`,
    });
    const tagSuffix = crypto.randomUUID().slice(0, 8);
    const tags = [`Scandi-${tagSuffix}`, `Boho-${tagSuffix}`];

    try {
      await addItemTagsQuery(item.item_id, tags);
      await deleteItemTagsQuery(item.item_id, []);

      const mappings = await pg`
        select * from item_tags where item_id = ${item.item_id}
      `;
      expect(mappings.length).toBe(2);
    } finally {
      const lowerTags = tags.map((tag) => tag.toLowerCase());
      await pg`delete from item_tags where item_id = ${item.item_id}`;
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
      await pg`delete from tags where tag_name in ${pg(lowerTags)}`;
    }
  }, 15000);

  test("no-op when provided tags do not exist", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `delete-tags-noop-${crypto.randomUUID()}`,
    });
    const tagSuffix = crypto.randomUUID().slice(0, 8);
    const existingTags = [`Japandi-${tagSuffix}`, `Rustic-${tagSuffix}`];
    const nonExistingTag = `NonExisting-${crypto.randomUUID()}`;

    try {
      await addItemTagsQuery(item.item_id, existingTags);
      await deleteItemTagsQuery(item.item_id, [nonExistingTag]);

      const mappings = await pg`
        select t.tag_name
        from item_tags it
        join tags t on t.tag_id = it.tag_id
        where it.item_id = ${item.item_id}
        order by t.tag_name asc
      `;
      expect(mappings.length).toBe(2);
    } finally {
      const lowerTags = existingTags.map((tag) => tag.toLowerCase());
      await pg`delete from item_tags where item_id = ${item.item_id}`;
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
      await pg`delete from tags where tag_name in ${pg(lowerTags)}`;
    }
  }, 15000);

  test("deletes only matching tag mappings for item", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `delete-tags-success-${crypto.randomUUID()}`,
    });
    const tagSuffix = crypto.randomUUID().slice(0, 8);
    const tags = [`Industrial-${tagSuffix}`, `Coastal-${tagSuffix}`];
    const lowerTags = tags.map((tag) => tag.toLowerCase()).sort();

    try {
      await addItemTagsQuery(item.item_id, tags);
      await deleteItemTagsQuery(item.item_id, [tags[0]]);

      const mappings = await pg`
        select t.tag_name
        from item_tags it
        join tags t on t.tag_id = it.tag_id
        where it.item_id = ${item.item_id}
        order by t.tag_name asc
      `;
      expect(mappings.length).toBe(1);
      expect(mappings[0].tag_name).toBe(
        lowerTags[0] === tags[0].toLowerCase() ? lowerTags[1] : lowerTags[0],
      );
    } finally {
      await pg`delete from item_tags where item_id = ${item.item_id}`;
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
      await pg`delete from tags where tag_name in ${pg(lowerTags)}`;
    }
  }, 15000);
});

describe("createReviewQuery", () => {
  test("inserts review and returns the created row", async () => {
    const seller = await insertUser();
    const reviewer = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `create-review-success-${crypto.randomUUID()}`,
    });
    const reviewId = crypto.randomUUID();

    try {
      const result: any = await createReviewQuery(
        reviewId,
        reviewer.user_id,
        item.item_id,
        "Beautiful craftsmanship.",
        5,
      );

      expect(result.length).toBe(1);
      expect(result[0].review_id).toBe(reviewId);
      expect(result[0].user_id).toBe(reviewer.user_id);
      expect(result[0].item_id).toBe(item.item_id);
      expect(result[0].review).toBe("Beautiful craftsmanship.");
      expect(Number(result[0].rating)).toBe(5);
      expect(result[0].review_date).not.toBe(undefined);

      const rows = await pg`select * from reviews where review_id = ${reviewId}`;
      expect(rows.length).toBe(1);
      expect(rows[0].review).toBe("Beautiful craftsmanship.");
      expect(Number(rows[0].rating)).toBe(5);
    } finally {
      await pg`delete from reviews where review_id = ${reviewId}`;
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id, reviewer.user_id],
      });
    }
  });

  test("throws when item_id does not exist", async () => {
    const reviewer = await insertUser();
    const reviewId = crypto.randomUUID();

    try {
      await expect(
        createReviewQuery(
          reviewId,
          reviewer.user_id,
          crypto.randomUUID(),
          "Review for nonexistent item",
          3,
        ),
      ).rejects.toThrow();
    } finally {
      await deleteTestData({ userIds: [reviewer.user_id] });
    }
  });

  test("throws when user_id does not exist", async () => {
    const seller = await insertUser();
    const item = await insertItem({
      seller_id: seller.user_id,
      item_name: `create-review-bad-user-${crypto.randomUUID()}`,
    });
    const reviewId = crypto.randomUUID();

    try {
      await expect(
        createReviewQuery(
          reviewId,
          crypto.randomUUID(),
          item.item_id,
          "Review from nonexistent user",
          4,
        ),
      ).rejects.toThrow();
    } finally {
      await deleteTestData({
        itemIds: [item.item_id],
        userIds: [seller.user_id],
      });
    }
  });
});
