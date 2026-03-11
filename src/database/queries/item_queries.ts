import { sql } from "../client";
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
