import { create } from "xmlbuilder2";
import { createOrderQuery } from "./database/queries/order_queries";
import {
  register,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  logout,
  logoutAll,
  getUserSessions,
  getUserDetailsById,
  getMyProfileDetails,
  deleteUser,
} from "./application/user_application";
import { deleteExpiredRefreshTokens } from "./utils/jwt_helpers";
import { handleUserRoutes } from "./routes/user_routes";
import { handleHealthRoutes } from "./routes/health_routes";
import { deleteItem } from "./application/item_application";
import { updateItem } from "./application/item_application";
import { addItemToCart } from "./application/order_application";
import {
  getAllItems,
  getItemByUserId,
  getItemsById,
  updateProfile,
} from "./application/item_application";

export async function handleRequest(req: any, res: any) {
  const { method, url, body } = req;

  if (url === "/" && method === "GET") {
    return res.status(200).json({
      test: "hello",
    });
  }
  if (url === "/auth/register" && method === "POST") {
    const response = await register(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/login" && method === "POST") {
    const response = await login(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/refresh" && method === "POST") {
    const response = await refresh(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/clean-tokens" && method === "DELETE") {
    await deleteExpiredRefreshTokens();
    return res.status(200).json({
      message: "Deleted refresh tokens",
    });
  }

  if (url === "/auth/logout" && method === "POST") {
    const response = await logout(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/logout-all" && method === "POST") {
    const response = await logoutAll(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/forgot-password" && method === "POST") {
    const response = await forgotPassword(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/reset-password" && method === "POST") {
    const response = await resetPassword(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url.match(/^\/items\/[a-zA-Z0-9_-]+$/) && method === "DELETE") {
    const response = await deleteItem(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url.match(/^\/items\/[a-zA-Z0-9_-]+$/) && method === "PATCH") {
    const response = await updateItem(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/cart/items" && method === "POST") {
    const response = await addItemToCart(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // /items
  if (url === "/items" && method === "GET") {
    const response = await getAllItems(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // /items/{item_id}
  if (url.match(/^\/items\/[a-zA-Z0-9_-]+$/) && method === "GET") {
    const response = await getItemsById(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // /user/{user_id}/items
  if (url.match(/^\/users\/[a-zA-Z0-9_-]+\/items$/) && method === "GET") {
    const response = await getItemByUserId(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // POST /orders/validate
  if (url === "/orders/validate" && method === "POST") {
    const contentType =
      req.headers?.get?.("content-type") || req.headers?.["content-type"];

    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        error: "UNSUPPORTED_TYPE",
        message: "This content type is not supported",
      });
    }

    let parsedBody = body;

    try {
      if (!parsedBody && req.json) {
        parsedBody = await req.json();
      }
    } catch (error) {
      return res.status(400).json({
        error: "INVALID_INPUT",
        message: "The request body is not valid",
      });
    }

    const { issueDate, buyer, seller, orderLines } = parsedBody || {};

    if (
      !issueDate ||
      typeof issueDate !== "string" ||
      !buyer ||
      typeof buyer !== "string" ||
      !seller ||
      typeof seller !== "string" ||
      !Array.isArray(orderLines) ||
      orderLines.length === 0
    ) {
      return res.status(422).json({
        error: "VALIDATION_FAILED",
        message: "The request body is missing mandatory fields",
      });
    }

    for (const line of orderLines) {
      if (
        !line ||
        typeof line !== "object" ||
        !line.itemID ||
        typeof line.itemID !== "string" ||
        typeof line.quantity !== "number" ||
        line.quantity <= 0 ||
        typeof line.priceAtPurchase !== "number" ||
        line.priceAtPurchase < 0
      ) {
        return res.status(422).json({
          error: "VALIDATION_FAILED",
          message: "The request body is missing mandatory fields",
        });
      }
    }

    return res.status(200).json({
      message: "Order payload is valid",
    });
  }

  // POST /orders
if (url === "/orders" && method === "POST") {
  // check request type is JSON
  const contentType =
    req.headers?.get?.("content-type") || req.headers?.["content-type"];

  if (!contentType || !contentType.includes("application/json")) {
    return res.status(415).json({
      error: "UNSUPPORTED_TYPE",
      message: "This content type is not supported",
    });
  }

  // attempt to parse rew body
  let parsedBody = body;

  try {
    if (!parsedBody && req.json) {
      parsedBody = await req.json();
    }
  } catch (error) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "The request body is not valid",
    });
  }

  // get order fields from req body: FIXED TO MATCH DB QUERY FIELDS
  const {
    orderName,
    buyerId,
    sellerId,
    documentCurrencyCode,
    pricingCurrencyCode,
    taxCurrencyCode,
    requestedInvoiceCurrencyCode,
    accountingCost,
    paymentMethodCode,
    destinationCountryCode,
    orderLines,
  } = parsedBody || {};

  // validate all fields required by databse query exist
  if (
    !orderName ||
    typeof orderName !== "string" ||
    !buyerId ||
    typeof buyerId !== "string" ||
    !sellerId ||
    typeof sellerId !== "string" ||
    !documentCurrencyCode ||
    typeof documentCurrencyCode !== "string" ||
    !pricingCurrencyCode ||
    typeof pricingCurrencyCode !== "string" ||
    !taxCurrencyCode ||
    typeof taxCurrencyCode !== "string" ||
    !requestedInvoiceCurrencyCode ||
    typeof requestedInvoiceCurrencyCode !== "string" ||
    typeof accountingCost !== "number" ||
    !paymentMethodCode ||
    typeof paymentMethodCode !== "string" ||
    !destinationCountryCode ||
    typeof destinationCountryCode !== "string" ||
    !Array.isArray(orderLines) ||
    orderLines.length === 0
  ) {
    return res.status(422).json({
      error: "VALIDATION_FAILED",
      message: "The request body is missing mandatory fields",
    });
  }

    // validate each order line, orderline must contain itemID, quantity, priceAtPurchase
  for (const line of orderLines) {
    if (
      !line ||
      typeof line !== "object" ||
      !line.itemID ||
      typeof line.itemID !== "string" ||
      typeof line.quantity !== "number" ||
      line.quantity <= 0 ||
      typeof line.priceAtPurchase !== "number" ||
      line.priceAtPurchase < 0
    ) {
      return res.status(422).json({
        error: "VALIDATION_FAILED",
        message: "The request body is missing mandatory fields",
      });
    }
  }

  // get unique orderID and timestamp
  const orderId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // make orderLines into the structure expected by CreateOrderQuery()
  const items = orderLines.map((line: any) => ({
    itemId: line.itemID,
    quantity: line.quantity,
    priceAtPurchase: line.priceAtPurchase,
  }));

  // JSON representation of UBL order document
  // FIX: CONVERT TO XML AFTER to store in DB 
  const orderJson = {
    Order: {
      "@xmlns": "urn:oasis:names:specification:ubl:schema:xsd:Order-2",
      "@xmlns:cac":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "@xmlns:cbc":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",

      "cbc:ID": orderId,
      "cbc:IssueDate": createdAt.slice(0, 10),

      "cac:BuyerCustomerParty": {
        "cac:Party": {
          "cbc:CustomerAssignedAccountID": buyerId,
        },
      },

      "cac:SellerSupplierParty": {
        "cac:Party": {
          "cbc:CustomerAssignedAccountID": sellerId,
        },
      },
      
      // convert each line in orderline UBL struc
      "cac:OrderLine": orderLines.map((line: any) => ({
        "cbc:ID": crypto.randomUUID(),
        "cbc:Quantity": String(line.quantity),
        "cac:Item": {
          "cbc:Name": line.itemName || line.itemID,
        },
      })),
    },
  };

  // convert JSON object into UBL XML format
  const xml = create(orderJson).end({ prettyPrint: true });

  // FIXED: call db query to perist order and orderlines for other routes
  // generated XML stored in db
  const response = await createOrderQuery(
    orderName,
    buyerId,
    sellerId,
    documentCurrencyCode,
    pricingCurrencyCode,
    taxCurrencyCode,
    requestedInvoiceCurrencyCode,
    accountingCost,
    paymentMethodCode,
    destinationCountryCode,
    xml,
    items,
  );

  // forwward repsonee from db query
  const responseBody = await response.json();
  return res.status(response.status).json(responseBody);
  }

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
