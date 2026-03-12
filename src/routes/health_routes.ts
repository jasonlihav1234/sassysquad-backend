import { getHealth } from "../application/health_application";

export async function handleHealthRoutes(req: any, res: any) {
  const { method, url } = req;

  if (method === "GET" && url === "/health") {
    await getHealth(req, res);
    return;
  }

  res.status(404).json({ error: "Path not found" });
}
