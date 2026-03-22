import {
  getUserPurchases,
  getUserSales,
} from "../application/user_application";

export async function handleUserRoutes(req: any, res: any) {
  const { method, url } = req;

  if (method === "GET" && url.match(/^\/users\/[^/]+\/purchases$/)) {
    const response = await getUserPurchases(req);
    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (method === "GET" && url.match(/^\/users\/[^/]+\/sales$/)) {
    const response = await getUserSales(req);
    const body = await response.json();
    return res.status(response.status).json(body);
  }

  return res.status(404).json({ error: "Path not found" });
}
