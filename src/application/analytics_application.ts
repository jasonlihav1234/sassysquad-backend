import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";
import pg, { redis } from "../utils/db";

const CACHE_TTL_SECONDS = 600;
const TIER_ORDER: any = {
  free: 0,
  pro: 1,
  enterprise: 2
};

async function getUserTier(userId: string | undefined): Promise<string> {
  if (!userId) return "free";

  const [row] = await pg`
  select subscription_tier
  from users
  where user_id = ${userId}
  `

  return row[0]?.subscription_tier ?? "free";
}

function hasAccess(userTier: string, requiredTier: string): boolean {
  return (TIER_ORDER[userTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
}

async function getCached<T>(key: string): Promise<T | null> {
  const cached = await redis.get(key);
  return cached ? (JSON.parse(cached) as T): null
}

async function setCached(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value));
  await redis.expire(key, CACHE_TTL_SECONDS);
}