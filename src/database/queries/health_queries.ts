import pg from "../../utils/db";

export async function checkHealthConnectivity(): Promise<boolean> {
  try {
    await pg`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
