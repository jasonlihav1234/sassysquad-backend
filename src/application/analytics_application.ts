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

  return row?.subscription_tier ?? "free";
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

function percentileToLabel(
  pct: number,
): "leading" | "strong" | "mid" | "emerging" {
  if (pct >= 0.9) return "leading";
  if (pct >= 0.7) return "strong";
  if (pct >= 0.4) return "mid";

  return "emerging";
}

export const getBasicAnalytics = authHelper(
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
      return jsonHelper(
        {
          message: "Failed to load analytics",
        },
        500,
      );
    }
  },
);

export const getEnterpriseAnalytics = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim as string;
    const userTier = await getUserTier(userId);

    if (!hasAccess(userTier, "enterprise")) {
      return jsonHelper(
        {
          message: "Enterprise subscription required",
          required: "enterprise",
        },
        403,
      );
    }

    const cacheKey = `analytics:enterprise:${userId}`;
    const cached = await getCached(cacheKey);
    if (cached) return jsonHelper(cached);

    try {
      const monthly = await pg`
        select extract(epoch from date_trunc('month', o.created_at))::bigint as t,
              sum(ol.price_at_purchase * ol.quantity)::numeric as revenue
        from order_lines ol
        join orders o on o.order_id = ol.order_id
        join items i on i.item_id = ol.item_id
        where i.seller_id = ${userId}
          and o.created_at >= now() - interval '6 months'
        group by date_trunc('month', o.created_at)
        order by date_trunc('month', o.created_at) asc
      `;

      const forecast = linearForecast(
        monthly.map((r: any) => ({ t: Number(r.t), y: Number(r.revenue) })),
        3,
      );

      const [ltv] = await pg`
        with buyer_totals as (
          select o.buyer_id,
                sum(ol.price_at_purchase * ol.quantity)::numeric as total_spent
          from orders o
          join order_lines ol on ol.order_id = o.order_id
          join items i on i.item_id = ol.item_id
          where i.seller_id = ${userId}
          group by o.buyer_id
        )
        select count(*)::int as unique_buyers,
              coalesce(avg(total_spent), 0)::numeric as avg_ltv
        from buyer_totals
      `;

      const [churn] = await pg`
        with active_then as (
          select distinct o.buyer_id
          from orders o
          join order_lines ol on ol.order_id = o.order_id
          join items i on i.item_id = ol.item_id
          where i.seller_id = ${userId}
            and o.created_at between now() - interval '6 months'
                                  and now() - interval '3 months'
        ),
        active_now as (
          select distinct o.buyer_id
          from orders o
          join order_lines ol on ol.order_id = o.order_id
          join items i on i.item_id = ol.item_id
          where i.seller_id = ${userId}
            and o.created_at >= now() - interval '3 months'
        )
        select count(*)::int as at_risk_count
        from active_then
        where buyer_id not in (select buyer_id from active_now)
      `;

      const [turnover] = await pg`
        select coalesce(avg(extract(epoch from (i.last_updated - i.created_at)) / 86400), 0)::int
          as avg_days_to_sellout
        from items i
        where i.seller_id = ${userId}
          and i.quantity_available = 0
          and i.last_updated > i.created_at
      `;

      const [position] = await pg`
        with seller_category as (
          select category_id from items
          where seller_id = ${userId}
          group by category_id
          order by count(*) desc
          limit 1
        ),
        category_sellers as (
          select i.seller_id,
                sum(ol.price_at_purchase * ol.quantity) as revenue
          from order_lines ol
          join orders o on o.order_id = ol.order_id
          join items i on i.item_id = ol.item_id
          where i.category_id = (select category_id from seller_category)
            and o.created_at >= now() - interval '90 days'
          group by i.seller_id
        ),
        ranked as (
          select seller_id, revenue,
                percent_rank() over (order by revenue) as pct_rank
          from category_sellers
        )
        select pct_rank from ranked where seller_id = ${userId}
      `;

      const competitivePosition = percentileToLabel(
        Number(position?.pct_rank ?? 0),
      );

      const result = {
        forecastNextQuarter: Math.round(forecast),
        customerLifetimeValue: Number(Number(ltv.avg_ltv).toFixed(2)),
        uniqueBuyers: ltv.unique_buyers,
        churnRiskCount: churn.at_risk_count,
        inventoryTurnoverDays: turnover.avg_days_to_sellout,
        competitivePosition,
        marketShareSegment: position
          ? Number((Number(position.pct_rank) * 100).toFixed(1))
          : 0,
      };

      await setCached(cacheKey, result);
      return jsonHelper(result);
    } catch (error) {
      console.error("getEnterpriseAnalytics failed:", error);
      return jsonHelper({ message: "Failed to load analytics" }, 500);
    }
  },
);
