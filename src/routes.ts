import { create } from "xmlbuilder2";
import {
  register,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  logout,
  logoutAll,
} from "./application/user_application";
import { jsonHelper, deleteExpiredRefreshTokens } from "./utils/jwt_helpers";

export async function handleRequest(req: any, res: any) {
  const { method, url, body } = req;

  if (url === "/" && method === "GET") {
    return res.status(200).json({
      test: "hello",
    });
  }
  if (url === "/auth/register" && method === "POST") {
    return await register(req);
  }

  if (url === "/auth/login" && method === "POST") {
    return await login(req);
  }

  if (url === "/auth/refresh" && method === "POST") {
    return await refresh(req);
  }

  if (url === "/auth/clean-tokens" && method === "GET") {
    return await deleteExpiredRefreshTokens();
  }

  if (url === "/auth/logout" && method === "POST") {
    return await logout(req);
  }

  if (url === "/auth/logout-all" && method === "POST") {
    return await logoutAll(req);
  }

  if (url === "/auth/forgot-password" && method === "POST") {
    return await forgotPassword(req);
  }

  if (url === "/auth/reset-password" && method === "POST") {
    return await resetPassword(req);
  }

  // POST /orders
  if (url === "/orders" && method === "POST") {
    const { userId, orderLines } = body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "userId is required and must be a string",
      });
    }

    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return res.status(400).json({
        error: "orderLines is required and must be a non-empty array",
      });
    }

    const newOrder = {
      orderId: crypto.randomUUID(),
      userId,
      orderLines,
      createdAt: new Date().toISOString(),
    };

    const root = create({ version: "1.0" }).ele("Order", {
      xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Order-2",
      "xmlns:cac":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "xmlns:cbc":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    });

    root.ele("cbc:ID").txt(newOrder.orderId).up();
    root.ele("cbc:IssueDate").txt(newOrder.createdAt.slice(0, 10)).up();

    const buyerParty = root.ele("cac:BuyerCustomerParty").ele("cac:Party");
    buyerParty.ele("cbc:CustomerAssignedAccountID").txt(newOrder.userId).up();
    buyerParty.up().up();

    for (let i = 0; i < orderLines.length; i++) {
      const line = orderLines[i];

      const orderLine = root.ele("cac:OrderLine");
      orderLine
        .ele("cbc:ID")
        .txt(String(i + 1))
        .up();
      orderLine
        .ele("cbc:Quantity")
        .txt(String(line.quantity ?? 1))
        .up();

      const item = orderLine.ele("cac:Item");
      item
        .ele("cbc:Name")
        .txt(line.itemName || "Unknown Item")
        .up();
      item.up();

      orderLine.up();
    }

    const xml = root.end({ prettyPrint: true });

    res.setHeader("Content-Type", "application/xml");
    return res.status(201).send(xml);
  }
  
  // DELETE /orders/{id}
  if (method === "DELETE" && /\/orders\/[^/]+/.test(url)) {
    const { userId, orderLines } = body || {};
    const orderId = url.split("/")[1];

    if (!orderId) { // TODO: invalid orderid
      return jsonHelper({ error: "Bad Request" }, 400);
    }

    // Lookup?

    if (userId != order.userId) {
      return jsonHelper({ error: "Forbidden" }, 403);
    }

    if (!order) {
      return jsonHelper({ error: "Not Found" }, 404);
    }

    // delete?
    
    return res.status(204).send(xml);
  }

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
