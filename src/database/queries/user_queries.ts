import { sql } from "../client";
import type { Order } from "../../types/order";

/**
 * Fetches an userID based on its name.
 */
export async function getUserIdByName(
  userName: string
): Promise<string | null> {
  const result = await sql`
    SELECT user_id 
    FROM users 
    WHERE user_name = ${userName}
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0].id;
}

/**
 * Retrieves all sucessfully generated buyer orders for a user
 * in descending creation time of order
 */

export async function getUserBuyerOrders(userId: string): Promise<Order[]> {
  const rows = await sql`
  SELECT *
  FROM ORDERS
  WHERE buyer_id = ${userId}
  ORDER BY issue_date DESC
  `;

  return rows;
}

/**
 * Retrieves all sucessfully created seller orders for a user
 * in descending creation time of order
 */

export async function getUserSellerOrders(userId: string): Promise<Order[]> {
  const rows = await sql`
  SELECT *
  FROM ORDERS
  WHERE seller_id = ${userId}
  ORDER BY issue_date DESC
  `;

  return rows;
}

export async function isUserIdValid(userId: string): Promise<Boolean> {
  const row = await sql`
  SELECT 1 
  FROM users 
  WHERE user_id = ${userId}
  LIMIT 1
  `;

  return row.length > 0;
}
