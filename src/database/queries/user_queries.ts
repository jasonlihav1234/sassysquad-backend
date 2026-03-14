import pg from "../../utils/db";
import type { Order } from "../../types/order";
import { jsonHelper } from "../../utils/jwt_helpers";
import bcrypt from "bcrypt";

interface UpdateUserPayload {
  user_name?: string | null;
  email?: string | null;
  password?: string;
}

/**
 * Fetches an userID based on its name.
 */
export async function getUserIdByName(
  userName: string,
): Promise<string | null> {
  const result = await pg`
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
  const rows = await pg`
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
  const rows = await pg`
  SELECT *
  FROM ORDERS
  WHERE seller_id = ${userId}
  ORDER BY issue_date DESC
  `;

  return rows;
}

export async function isUserIdValid(userId: string): Promise<boolean> {
  const row = await pg`
  SELECT 1 
  FROM users 
  WHERE user_id = ${userId}
  LIMIT 1
  `;

  return row.length > 0;
}

export async function updateProfileQuery(
  user_id: string,
  update: UpdateUserPayload,
) {
  try {
    const [existingUser] = await pg`
      select * from users where user_id = ${user_id}
    `;

    if (!existingUser) {
      return jsonHelper({ error: "User not found" }, 404);
    }

    const desiredState: Record<string, any> = {
      user_name: update.user_name,
      email: update.email,
    };

    if (update.password) {
      const saltRounds = 10;

      desiredState.password_hash = await bcrypt.hash(
        update.password,
        saltRounds,
      );
    }

    const updatesToApply: Record<string, any> = {};

    for (const [column, newValue] of Object.entries(desiredState)) {
      if (newValue === undefined) {
        continue;
      }

      if (existingUser[column] !== newValue) {
        updatesToApply[column] = newValue;
      }
    }

    if (Object.keys(updatesToApply).length > 0) {
      const res = await pg`
        update users
        set ${pg(updatesToApply)}
        where user_id = ${user_id}
      `;

      return res;
    }

    return [];
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function getUserById(userId: string) {
  try {
    const response = await pg`select * from users where user_id = ${userId}`;

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export async function removeUserById(userId: string) {
  try {
    const response = await pg`delete from users where user_id = ${userId}`;

    return response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
