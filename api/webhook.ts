import { VercelRequest, VercelResponse } from "@vercel/node";
import { serverWebhook } from "../src/application/order_application";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function webhookHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  try {
    const response = await serverWebhook(rawBody, signature);
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) {
    console.error("Webhook handler error:", error);
    return res.status(400).json({ error: "Webhook failed" });
  }
}
