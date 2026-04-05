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

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  const signature = req.headers["stripe-signature"] as string;

  try {
    const result = await serverWebhook(rawBody, signature);
    return res.status(200).json(result);
  } catch (error) {
    console.log(error);
    return res.status(400).json({ error: "Webhook failed" });
  }
}
