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
    const items = await pg`select * from items where user_id = ${userId}`;

    return items;
  } catch (error) {
    throw error;
  }
}
