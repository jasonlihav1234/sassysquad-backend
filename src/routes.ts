export async function handleRequest(req, res) {
  const { method, url, body } = req;

  if (url === "/" && method == "GET") {
    const ret_val = {
      test: "hello",
    };

    return res.status(200).json(ret_val);
  }

   // POST /orders
  if (url === "/orders" && method === "POST") {
      // Extract expected fields from request body
      // should contain userId and orderLines
    const { userId, orderLines } = body || {};

    // validate userId exists and is string
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "userId is required and must be a string",
      });
    }

    // validate orderLines is non empty array
    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      return res.status(400).json({
        error: "orderLines is required and must be a non-empty array",
      });
    }

    // cretae new order object USE crypto.randomUUID to generate unique order ID
    const newOrder = {
      orderId: crypto.randomUUID(),
      userId,
      orderLines,
      createdAt: new Date().toISOString(),
    };
    
    // return new created order
    return res.status(201).json(newOrder);
  }

  // debugging
  console.log(method, url);

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
