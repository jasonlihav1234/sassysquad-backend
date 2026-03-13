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

  return result[0].id;
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
