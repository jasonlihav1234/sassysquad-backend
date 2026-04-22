import pg from "../../utils/db";
import type { Order } from "../../types/order";
import { jsonHelper } from "../../utils/jwt_helpers";
import bcrypt from "bcrypt";

interface UpdateUserPayload {
  user_name?: string | null;
  email?: string | null;
  password?: string;
  biography?: string | null;
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

  return result[0].user_id;
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
      biography: update.biography,
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

/**
 * Appends an item_id to a user's saved items array if not already present.
 * Returns the updated saved array.
 */
export async function addSavedItemByUserId(
  userId: string,
  itemId: string,
): Promise<string[]> {
  try {
    const rows = await pg`
      update users
      set saved = case
        when ${itemId} = any(saved) then saved
        else array_append(saved, ${itemId})
      end
      where user_id = ${userId}
      returning saved
    `;

    if (rows.length === 0) {
      throw new Error("User not found");
    }

    return rows[0].saved;
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

export async function updateSubscriptionByUserId(
  userId: string,
  subscriptionTier: string,
) {
  const validTiers = ["free", "pro", "enterprise"];
  if (!validTiers.includes(subscriptionTier)) {
    throw new Error("Invalid tier");
  }

  try {
    const query = await pg`
    update users
    set subscription_tier = ${subscriptionTier}
    where user_id = ${userId}
    returning subscription_tier
    `;

    if (query.length === 0) {
      throw new Error("User not found");
    }

    return jsonHelper({
      message: "Subscription updated"
    });
  } catch (error) {
    console.log(error);
    throw error;
  }
}
