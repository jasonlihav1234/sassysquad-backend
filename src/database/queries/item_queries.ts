import pg from "../../utils/db";
import { jsonHelper } from "../../utils/jwt_helpers";

/**
 * Fetches an itemID based on its name.
 */
export async function getItemIdByName(
  itemName: string,
): Promise<string | null> {
  // add try catch here and throw
  const result = await pg`
    SELECT item_id 
    FROM items 
    WHERE item_name = ${itemName}
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0].item_id;
}

/**
 * Get items given an item ID
 */
export async function getItemByItemIdQuery(itemId: string) {
  try {
    const result = await pg`
    select *
    from items
    where item_id = ${itemId}
    `;

    return result;
  } catch (error) {
    throw error;
  }
}

/*
 * Gets all reviews for a given item_id
 */
export async function getReviewsByItemIdQuery(itemId: string) {
  try {
    const result = await pg`
      select *
      from reviews
      where item_id = ${itemId}
      order by review_date desc
    `;

    return result;
  } catch (error) {
    throw error;
  }
}

/*
 * Creates a review for a given item_id
 */
export async function createReviewQuery(
  reviewId: string,
  userId: string,
  itemId: string,
  review: string,
  rating: number,
) {
  try {
    const result = await pg`
      insert into reviews (review_id, user_id, item_id, review, rating)
      values (${reviewId}, ${userId}, ${itemId}, ${review}, ${rating})
      returning *
    `;

    return result;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Gets all items
 */
export async function getAllItemsQuery() {
  try {
    return await pg`select * from items`;
  } catch (error) {
    throw error;
  }
}

/*
 * Gets a seller's user_name from their seller_id
 */
export async function getSellerUsernameBySellerIdQuery(
  sellerId: string,
): Promise<string | null> {
  try {
    const result = await pg`
      select u.user_name
      from users u
      where u.user_id = ${sellerId}
      limit 1
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].user_name;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Gets all items given a userId
 */
export async function getItemsUserQuery(userId: string) {
  try {
    const items = await pg`select * from items where seller_id = ${userId}`;

    return items;
  } catch (error) {
    throw error;
  }
}

/*
 * Creates an item
 */
export async function createItemQuery(
  itemId: string,
  sellerId: string,
  itemName: string,
  description: string | null,
  price: number,
  quantityAvailable: number,
  imageUrl: string | null,
) {
  try {
    const response = await pg`
      insert into items (
        item_id,
        seller_id,
        item_name,
        description,
        price,
        quantity_available,
        image_url,
        created_at,
        last_updated
      )
      values (
        ${itemId},
        ${sellerId},
        ${itemName},
        ${description},
        ${price},
        ${quantityAvailable},
        ${imageUrl},
        ${new Date().toISOString()},
        ${new Date().toISOString()}
      )
      returning *
    `;

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Creates an item, need a include tags for the item
 */
export async function createItemQueryV2(
  itemId: string,
  sellerId: string,
  itemName: string,
  description: string | null,
  price: number,
  quantityAvailable: number,
  imageUrl: string | null,
  categoryName: string,
  tags: string[],
) {
  try {
    if (tags.length === 0) {
      throw Error("No tags provided for item");
    }
    const transformedTags = tags.map((tag) => tag.toLowerCase());

    const response = await pg.begin(async (sql) => {
      const categoryNameLower = categoryName.toLowerCase();

      const categoryQuery = await sql`
        insert into categories (category_id, category_name)
        values (${crypto.randomUUID()},${categoryNameLower})
        on conflict (category_name)
        do update set category_name = excluded.category_name
        returning category_id;
      `;

      const categoryId = categoryQuery[0].category_id;

      // need to make sure that these tags exist in the database, if not, insert it

      const itemQuery: any = await sql`
        insert into items (
          item_id,
          seller_id,
          item_name,
          description,
          price,
          quantity_available,
          image_url,
          created_at,
          last_updated,
          category_id
        )
        values (
          ${itemId},
          ${sellerId},
          ${itemName},
          ${description},
          ${price},
          ${quantityAvailable},
          ${imageUrl},
          ${new Date().toISOString()},
          ${new Date().toISOString()},
          ${categoryId}
        )
        returning *
      `;

      const insertedItem = itemQuery[0];
      const tagsToInsert = transformedTags.map((name) => ({
        tag_id: crypto.randomUUID(),
        tag_name: name,
      }));

      await sql`
        insert into tags ${sql(tagsToInsert)}
        on conflict (tag_name) do nothing
      `;

      // fetch uuids for tags
      const currentTags = await sql`
        select tag_id, tag_name
        from tags
        where tag_name in ${sql(transformedTags)}
      `;

      const itemTagsToInsert = currentTags.map((tag: any) => ({
        item_id: itemId,
        tag_id: tag.tag_id,
      }));

      await sql`
        insert into item_tags ${sql(itemTagsToInsert)}
        on conflict do nothing
      `;

      return insertedItem;
    });

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Updates an item according to provided inputs
 */
export async function updateItemQuery(
  itemId: string,
  itemName: string | null,
  description: string | null,
  price: number | null,
  quantity_available: number | null,
  image_url: string | null,
): Promise<Response> {
  try {
    const response = await pg`
    update items
    set
      item_name = coalesce(${itemName}, item_name),
      description = coalesce(${description}, description),
      price = coalesce(${price}, price),
      quantity_available = coalesce(${quantity_available}, quantity_available),
      image_url = coalesce(${image_url}, image_url),
      last_updated = ${new Date().toISOString()}
    where item_id = ${itemId}
    returning *
    `;

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function updateItemQueryV2(
  itemId: string,
  itemName: string | null,
  description: string | null,
  price: number | null,
  quantity_available: number | null,
  image_url: string | null,
  categoryName: string | null,
): Promise<Response> {
  try {
    const response = await pg.begin(async (sql) => {
      let categoryId: string | null = null;
      if (categoryName) {
        const categoryNameLower = categoryName.toLowerCase();

        const categoryQuery = await sql`
          insert into categories (category_id, category_name)
          values (${crypto.randomUUID()},${categoryNameLower})
          on conflict (category_name)
          do update set category_name = excluded.category_name
          returning category_id;
        `;

        categoryId = categoryQuery[0].category_id;
      }
      const updatedItem = await sql`
      update items
      set
        item_name = coalesce(${itemName}, item_name),
        description = coalesce(${description}, description),
        price = coalesce(${price}, price),
        quantity_available = coalesce(${quantity_available}, quantity_available),
        image_url = coalesce(${image_url}, image_url),
        last_updated = ${new Date().toISOString()},
        category_id = coalesce(${categoryId}, category_id)
      where item_id = ${itemId}
      returning *
      `;

      return updatedItem[0];
    });

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function addItemTagsQuery(item_id: string, tags: string[]) {
  try {
    // just assume item id already exists
    // get all the item ids for the tags, then add it to the item_tags table
    if (!tags || tags.length === 0) {
      return;
    }

    const transformedTags = tags.map((tag) => tag.toLowerCase());

    await pg.begin(async (sql) => {
      const tagsToInsert = transformedTags.map((name) => ({
        tag_id: crypto.randomUUID(),
        tag_name: name,
      }));

      await sql`
        insert into tags ${sql(tagsToInsert)}
        on conflict (tag_name) do nothing
      `;

      // fetch uuid for these tags
      const currentTags = await sql`
        select tag_id from tags
        where tag_name in ${sql(transformedTags)}
      `;

      const itemTagsToInsert = currentTags.map((tag: any) => ({
        item_id: item_id,
        tag_id: tag.tag_id,
      }));

      await sql`
        insert into item_tags ${sql(itemTagsToInsert)}
        on conflict do nothing
      `;
    });
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function deleteItemTagsQuery(item_id: string, tags: string[]) {
  try {
    if (!tags || tags.length === 0) {
      return;
    }

    const transformedTags = tags.map((tag) => tag.toLowerCase());

    await pg.begin(async (sql) => {
      const deleteTags = await sql`
        select tag_id from tags
        where tag_name in ${sql(transformedTags)}
      `;

      if (deleteTags.length === 0) {
        return;
      }

      const tagIds = deleteTags.map((tag: any) => tag.tag_id);

      await sql`
        delete from item_tags
        where item_id = ${item_id}
        and tag_id in ${sql(tagIds)}
      `;
    });
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Deletes an item given an item id
 */
export async function deleteItemFromIdQuery(itemId: string) {
  try {
    const response = await pg`delete from items where item_id = ${itemId}`;

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

/*
 * Fetches items based on tags and a category
 */
export async function fetchTaggedCategoryItem(
  categoryName: string,
  tags: string[],
) {
  try {
    return await pg`
    select
      i.item_id,
      i.item_name,
      i.price,
      i.image_url,
      count(t.tag_id) as match_count
    from items i

    join categories c on i.category_id = c.category_id

    join item_tags it on i.item_id = it.item_id

    join tags t on it.tag_id = t.tag_id

    where c.category_name = ${categoryName}
    and t.tag_name in ${pg(tags)}

    group by i.item_id, i.item_name, i.price, i.image_url

    order by match_count desc

    limit 10
    `;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getAllCategoriesQuery() {
  try {
    return await pg`
    select * from categories
    `;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getAllTagsQuery() {
  try {
    return await pg`
    select * from tags
    `;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getItemTagsByItemIdQuery(itemId: string): Promise<string[]> {
  try {
    const result = await pg`
      select t.tag_name
      from item_tags it
      join tags t on it.tag_id = t.tag_id
      where it.item_id = ${itemId}
    `;

    return result.map((row: any) => row.tag_name);
  } catch (error) {
    console.log(error);
    throw error;
  }
}
