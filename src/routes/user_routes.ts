import { getUserPurchases } from "../application/user_application";

export async function handleUserRoutes(req: any, res: any) {
  const { method, url } = req;

  if (method === "GET" && url.match(/^\/users\/[^/]+\/purchases$/)) {
    await getUserPurchases(req, res);
    return;
  }
}
