import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";
import pg, { redis } from "../utils/db";

const CACHE_TTL_SECONDS = 600;
const TIER_ORDER: any = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

async function getUserTier(userId: string | undefined): Promise<string> {
  if (!userId) return "free";

  const [row] = await pg`
  select subscription_tier
  from users
  where user_id = ${userId}
  `;

  return row[0]?.subscription_tier ?? "free";
}

function hasAccess(userTier: string, requiredTier: string): boolean {
  return (TIER_ORDER[userTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
}

async function getCached<T>(key: string): Promise<T | null> {
  const cached = await redis.get(key);
  return cached ? (JSON.parse(cached) as T) : null;
}

async function setCached(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value));
  await redis.expire(key, CACHE_TTL_SECONDS);
}

function linearForecast(points: { t: number, y: number }[], periods: number) {
  if (points.length < 2) {
    return points[0]?.y ?? 0;
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.t, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.t * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.t * p.t, 0);
 
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
 
  const last = points[points.length - 1].t;
  const monthInSeconds = 60 * 60 * 24 * 30;
 
  let projected = 0;
  for (let i = 1; i <= periods; i++) {
    const t = last + i * monthInSeconds;
    projected += Math.max(0, slope * t + intercept);
  }
 
  return projected;
}

export const getBasicAnalytucs = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim as string;
    const cacheKey = `analytics:basic:${userId}`;

    const cached = await getCached(cacheKey);
    if (cached) {
      return jsonHelper(cached);
    }

    try {

      const [stats] = await pg`
      select
        coalesce(sum(case when o.created_at >= date_trunc('quarter', now())
                          then ol.price_at_purchase * ol.quantity else 0 end), 0)::numeric as revenue_this_quarter,
        coalesce(sum(case when o.created_at >= date_trunc('month', now())
                          then ol.price_at_purchase * ol.quantity else 0 end), 0)::numeric as revenue_this_month,
        coalesce(sum(case when o.created_at >= date_trunc('month', now() - interval '1 month')
                           and o.created_at <  date_trunc('month', now())
                          then ol.price_at_purchase * ol.quantity else 0 end), 0)::numeric as revenue_last_month,
        count(distinct ol.order_id) filter (where o.created_at >= date_trunc('quarter', now()))::int as orders_this_quarter,
        coalesce(sum(ol.quantity), 0)::int as items_sold_total
      from order_lines ol
      join orders o on o.order_id = ol.order_id
      where o.seller_id = ${userId}
    `;

      const [listings] = await pg`
    select count(*)::int as active_listings
    from items
    where seller_id = ${userId} and quantity_available > 0
    `;

    const lastMonth = Number(stats.revenue_last_month);
    const thisMonth = Number(stats.revenue_this_month);
    const monthOverMonth = lastMonth > 0 ? Number((((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1)) : null;

    const result = {
      revenueThisQuarter: Number(stats.revenue_this_quarter),
      revenueThisMonth: thisMonth,
      ordersThisQuarter: stats.orders_this_quarter,
      itemsSoldTotal: stats.items_sold_total,
      activeListings: listings.active_listings,
      monthOverMonth
    };

    await setCached(cacheKey, result);
    return jsonHelper(result);
    } catch (error) {
      console.log(error);
      return jsonHelper({
        message: "Failed to load analytics"
      }, 500);
    }
  },
);
