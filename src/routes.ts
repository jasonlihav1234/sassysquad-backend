import { create } from "xmlbuilder2";
import {
  createOrderQuery,
  getOrderById,
  updateOrdersById,
} from "./database/queries/order_queries";
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
import {
  addItemToCart,
  deleteItemFromCart,
  updateCartItem,
  checkCheckoutSessionStatus,
  createCheckoutSession,
  postOrder,
  serverWebhook,
} from "./application/order_application";
import { deleteItem } from "./application/item_application";
import { updateItem } from "./application/item_application";
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

  if (
    (url === "/cart" || url.match(/^\/cart\/items\/[a-zA-Z0-9_-]+$/)) &&
    method === "DELETE"
  ) {
    const response = await deleteItemFromCart(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url.match(/^\/cart\/items\/[a-zA-Z0-9_-]+$/) && method === "PATCH") {
    const response = await updateCartItem(req);

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

  // POST /orders - need a seller id should be easy to obtain
  // each orderLine should follow:
  //[
  //  {
  //      quantity,
  //      priceAtPurchase,
  //      itemId,
  //      taxPercentPer
  //  }
  //]
  if (url === "/orders" && method === "POST") {
    const response = await postOrder(req);

    const responseBody = await response.json();
    return res.status(response.status).json(responseBody);
  }

  // PUT /orders
  if (method === "PUT" && /\/orders\/[^/]+/.test(url)) {
    const { userId, updates } = body || {};
    const orderId = url.split("/")[1];

    if (!orderId) {
      return res.status(400).json({ error: "Bad Request" });
    }

    // if () { // TODO: invalid access token
    //   return res.status(401).json({ error: "Unauthorised" });
    // }

    const order = await getOrderById(orderId);

    if (userId !== order.buyerId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!order) {
      return res.status(404).json({ error: "Order not found!" });
    }

    return await updateOrdersById(orderId, updates);

    return res.status(200);
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

  if (url === "/create-checkout-session" && method === "POST") {
    const response = await createCheckoutSession(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (
    url.match(/^\/checkout-session-status\/[a-zA-Z0-9_-]+$/) &&
    method === "GET"
  ) {
    const response = await checkCheckoutSessionStatus(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/webhook" && method === "POST") {
    const response = await serverWebhook(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}

  // POST /items
  if (url === "/items" && method === "POST") {
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
        error: "Bad Request",
        message: "Invalid/missing items fields",
      });
    }

    const authHeader =
      req.headers?.get?.("authorization") ||
      req.headers?.get?.("Authorization") ||
      req.headers?.authorization ||
      req.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorised",
        message: "Access Token invalid",
      });
    }

    const { itemName, description, price, quantityAvailable, imageUrl } =
      parsedBody || {};

    if (
      !itemName ||
      typeof itemName !== "string" ||
      typeof price !== "number" ||
      price < 0 ||
      typeof quantityAvailable !== "number" ||
      quantityAvailable < 0 ||
      (description !== undefined && typeof description !== "string") ||
      (imageUrl !== undefined && typeof imageUrl !== "string")
    ) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid/missing items fields",
      });
    }

    const newItem = {
      itemId: crypto.randomUUID(),
      itemName,
      description: description || null,
      price,
      quantityAvailable,
      imageUrl: imageUrl || null,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    return res.status(201).json({
      message: "Item created successfully",
      item: newItem,
    });
  }