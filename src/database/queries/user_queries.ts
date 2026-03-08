import { sql } from "../client";

/**
 * Fetches an userID based on its name.
 */
export async function getUserIdByName(
  userName: string,
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
