import { getHealth } from "../application/health_application";

export async function handleHealthRoutes(req: any, res: any) {
  const { method, url } = req;

  if (method === "GET" && url === "/health") {
    const response = await getHealth(req);
    const body = await response.json();
    return res.status(response.status).json(body);
  }

  res.status(404).json({ error: "Path not found" });
}
