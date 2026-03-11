import pg from "../../utils/db";
import { jsonHelper } from "../../utils/jwt_helpers";

/**
 * Fetches an itemID based on its name.
 */
export async function getItemIdByName(
  itemName: string,
): Promise<string | null> {
  const result = await sql`
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


/*
 * Gets all items
*/
export async function getAllItems() {
  try {
    const items = await pg`select * from items`;

    return jsonHelper({ message: "Fetch all items succeeded", payload: items });
  } catch (error) {
    return jsonHelper({ message: "Fetch failed", error: error}, 500);
  }
}

/*
 * Gets all items given a userId
*/
export async function getItemsUser(
  userId: string
) {
  try {
    const items = await pg`select * from items where user_id = ${userId}`;

    return jsonHelper({ message: "Fetch items succeeded", payload: items});
  } catch (error) {
    return jsonHelper({ message: "Fetch failed", error: error}, 500);
  }
}

/*
 * Updates an item according to provided inputs 
*/
export async function updateItemQuery(
  itemId: string,
  sellerId: string | null,
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
      seller_id = coalesce(${sellerId}, seller_id),
      item_name = coalesce(${itemName}, item_name),
      description = coalesce(${description}, description),
      price = coalesce(${price}, price).
      quantity_available = coalesce(${quantity_available}, quantity_available),
      image_url = coalesce(${image_url}, image_url)
      last_updated = ${new Date().toISOString()}
    where id = ${itemId}
    returning *
    `;

    return jsonHelper({ message: "Item updated", response : response});
  } catch (error) {
    return jsonHelper({ message: "Update failed", error: error }, 500);
  }
}

/*
 * Deletes an item given an item id
*/
export async function deleteItemFromId(
  itemId: string
) {
  try {
    const response = await pg`delete from items where item_id = ${itemId}`;

    return response;
  } catch (error) {
    return jsonHelper({ error: error }, 500);
  }
}

