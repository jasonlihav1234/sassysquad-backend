import { create } from "xmlbuilder2";

import { create } from "xmlbuilder2";

export async function handleRequest(req, res) {
  const { method, url, body, body } = req;

  if (url === "/" && method === "GET") {
    const ret_val = {
      test: "hello",
    };

    return res.status(200).json(ret_val);
  }

   // POST /orders
if (url === "/orders" && method === "POST") {
    const { userId, orderLines } = body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "userId is required and needs to be string",
      });
    }

    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return res.status(400).json({
        error: "orderLines is required and has to be non empty array",
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
      orderLine.ele("cbc:ID").txt(String(i + 1)).up();
      orderLine.ele("cbc:Quantity").txt(String(line.quantity ?? 1)).up();

      const item = orderLine.ele("cac:Item");
      item.ele("cbc:Name").txt(line.itemName || "Unknown Item").up();
      item.up();

      orderLine.up();
    }

    const xml = root.end({ prettyPrint: true });

    res.setHeader("Content-Type", "application/xml");
    return res.status(201).send(xml);
  }

  // debugging
   // POST /orders
if (url === "/orders" && method === "POST") {
    const { userId, orderLines } = body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "userId is required and needs to be string",
      });
    }

    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return res.status(400).json({
        error: "orderLines is required and has to be non empty array",
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
      orderLine.ele("cbc:ID").txt(String(i + 1)).up();
      orderLine.ele("cbc:Quantity").txt(String(line.quantity ?? 1)).up();

      const item = orderLine.ele("cac:Item");
      item.ele("cbc:Name").txt(line.itemName || "Unknown Item").up();
      item.up();

      orderLine.up();
    }

    const xml = root.end({ prettyPrint: true });

    res.setHeader("Content-Type", "application/xml");
    return res.status(201).send(xml);
  }

  // debugging
  console.log(method, url);

  // 404 if no roiutes match
  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
