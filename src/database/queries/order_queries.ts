import { sql } from "../client";

/**
 * Fetches an orderID based on its name.
 */
export async function getOrderIdByName(
  orderName: string,
): Promise<string | null> {
  const result = await sql`
    SELECT order_id 
    FROM orders 
    WHERE order_name = ${orderName}
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0].id;
}
