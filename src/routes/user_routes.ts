import { getUserPurchases, getUserSales } from "../application/user_application";

export async function handleUserRoutes(req: any, res: any) {
  const { method, url } = req;

  if (method === "GET" && url.match(/^\/users\/[^/]+\/purchases$/)) {
    await getUserPurchases(req, res);
    return;
  }

  if (method === "GET" && url.match(/^\/users\/[^/]+\/sales$/)) {
    await getUserSales(req, res);
    return;
  }

  res.status(404).json({ error: "Path not found" });
}
