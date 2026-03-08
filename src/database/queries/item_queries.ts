import { sql } from "../client";

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
