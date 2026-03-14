import { create } from "xmlbuilder2";
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
  updateProfile,
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
    // Buildj JSON object
    const orderJson = {
      Order: {
        "@xmlns": "urn:oasis:names:specification:ubl:schema:xsd:Order-2",
        "@xmlns:cac":
          "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "@xmlns:cbc":
          "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",

        "cbc:ID": newOrder.orderId,
        "cbc:IssueDate": newOrder.createdAt.slice(0, 10),

        "cac:BuyerCustomerParty": {
          "cac:Party": {
            "cbc:CustomerAssignedAccountID": newOrder.userId,
          },
        },

        "cac:OrderLine": newOrder.orderLines.map((line, index) => ({
          "cbc:ID": crypto.randomUUID(),
          "cbc:Quantity": String(line.quantity),
          "cac:Item": {
            "cbc:Name": line.itemName || "Unknown Item",
          },
        })),
      },
    };

    // Now conbvet JSON to XML
    const xml = create(orderJson).end({ prettyPrint: true });

    res.setHeader("Content-Type", "application/xml");
    return res.status(201).send(xml);
  }

  if (url === "/profile" && method === "PATCH") {
    const response = await updateProfile(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/sessions" && method === "GET") {
    const response = await getUserSessions(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url.match(/^\/users\/[a-zA-Z0-9_-]+$/) && method === "GET") {
    const response = await getUserDetailsById(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/profile" && method === "GET") {
    const response = await getMyProfileDetails(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/profile" && method === "DELETE") {
    const response = await deleteUser(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
