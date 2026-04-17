import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";
import pg, { redis } from "../utils/db";
import { StringLike } from "bun";

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

function linearForecast(points: { t: number; y: number }[], periods: number) {
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

function percentileLabel(
  pct: number,
): "leading" | "strong" | "mid" | "emerging" {
  if (pct >= 0.9) return "leading";
  if (pct >= 0.7) return "strong";
  if (pct >= 0.4) return "mid";

  return "emerging";
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
      const monthOverMonth =
        lastMonth > 0
          ? Number((((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1))
          : null;

      const result = {
        revenueThisQuarter: Number(stats.revenue_this_quarter),
        revenueThisMonth: thisMonth,
        ordersThisQuarter: stats.orders_this_quarter,
        itemsSoldTotal: stats.items_sold_total,
        activeListings: listings.active_listings,
        monthOverMonth,
      };

      await setCached(cacheKey, result);
      return jsonHelper(result);
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Failed to load analytics",
        },
        500,
      );
    }
  },
);

export const getProAnalytics = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim as string;
    const userTier = await getUserTier(userId);

    if (!hasAccess(userTier, "pro")) {
      return jsonHelper(
        {
          message: "Pro subscription required",
          requires: "pro",
        },
        403,
      );
    }

    const cacheKey = `analytics:pro:${userId}`;
    const cached = await getCached(cacheKey);
    if (cached) return jsonHelper(cached);

    try {
      const [conversion] = await pg`
      with views as (
        select count(*)::int as total_views
        from item_views iv
        join items i on i.item_id = iv.item_id
        where i.seller_id = ${userId}
          and iv.viewed_at >= now() - interval '90 days'
      ),
      sales as (
        select count(distinct ol.order_id)::int as order_count,
               coalesce(sum(ol.price_at_purchase * ol.quantity), 0)::numeric as total_revenue
        from order_lines ol
        join orders o on o.order_id = ol.order_id
        join items i on i.item_id = ol.item_id
        where i.seller_id = ${userId}
          and o.created_at >= now() - interval '90 days'
      )
      select views.total_views, sales.order_count, sales.total_revenue
      from views, sales
    `;

      const conversionRate =
        conversion.total_views > 0
          ? Number(
              ((conversion.order_count / conversion.total_views) * 100).toFixed(
                2,
              ),
            )
          : null;
      const averageOrderValue =
        conversion.order_count > 0
          ? Number(
              (
                Number(conversion.total_revenue) / conversion.order_count
              ).toFixed(2),
            )
          : 0;

      const [topCategory] = await pg`
      select c.category_name as name,
             sum(ol.price_at_purchase * ol.quantity)::numeric as revenue
      from order_lines ol
      join orders o on o.order_id = ol.order_id
      join items i on i.item_id = ol.item_id
      join categories c on c.category_id = i.category_id
      where i.seller_id = ${userId}
        and o.created_at >= now() - interval '90 days'
      group by c.category_name
      order by revenue desc
      limit 1
    `;

      const revenueByMonth = await pg`
      select to_char(date_trunc('month', o.created_at), 'Mon') as month,
             sum(ol.price_at_purchase * ol.quantity)::numeric as revenue
      from order_lines ol
      join orders o on o.order_id = ol.order_id
      join items i on i.item_id = ol.item_id
      where i.seller_id = ${userId}
        and o.created_at >= now() - interval '6 months'
      group by date_trunc('month', o.created_at)
      order by date_trunc('month', o.created_at) asc
    `;

      const [repeat] = await pg`
      with buyer_counts as (
        select o.buyer_id, count(*) as purchase_count
        from orders o
        join order_lines ol on ol.order_id = o.order_id
        join items i on i.item_id = ol.item_id
        where i.seller_id = ${userId}
        group by o.buyer_id
      )
      select count(*) filter (where purchase_count > 1)::int as repeat_buyers,
             count(*)::int as total_buyers
      from buyer_counts
    `;

      const repeatBuyerRate =
        repeat.total_buyers > 0
          ? Number(
              ((repeat.repeat_buyers / repeat.total_buyers) * 100).toFixed(1),
            )
          : 0;

      const result = {
        conversionRate,
        averageOrderValue,
        viewsToSales: conversion.total_views,
        repeatBuyerRate,
        topCategory: topCategory
          ? { name: topCategory.name, revenue: Number(topCategory.revenue) }
          : null,
        revenueByMonth: revenueByMonth.map((r: any) => ({
          month: r.month,
          revenue: Number(r.revenue),
        })),
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
