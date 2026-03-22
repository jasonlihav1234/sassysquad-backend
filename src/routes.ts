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
  deleteOrder,
  updateCartItem,
  checkCheckoutSessionStatus,
  createCheckoutSession,
  postOrder,
  serverWebhook,
  listOrder,
  validateOrder,
  updateOrder,
  getOrder,
} from "./application/order_application";
import {
  createItem,
  deleteItem,
  updateItem,
  getAllItems,
  getItemByUserId,
  getItemsById,
} from "./application/item_application";

export async function handleRequest(req: any, res: any) {
  const { method, url, body } = req;

  if (url === "/" && method === "GET") {
    res.setHeader("Content-Type", "text/html");

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SaasySquad</title>
          <style>
            body {
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f9fafb;
            }
            h1 { color: #333; }
            .gif-container { margin-top: 20px; }
            img { max-width: 300px; margin: 0 10px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>You've Reached The Root Of SaasySquad :O</h1>
          <a href="https://jasonlihav1234.github.io/sassysquad-backend/api-docs/" target="_blank" rel="noopener noreferrer">Our Swagger API</a>
          <div class="gif-container">
            <img src="https://media1.tenor.com/m/JHuU14ekU3EAAAAd/ishowspeed-deglove.gif" alt="SaasySquad GIF 1" />
            <img src="https://i.makeagif.com/media/11-08-2024/HSMtFe.gif" alt="SaasySquad GIF 2" />
          </div>
        </body>
      </html>
    `);
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
  // POST /items
  if (url === "/items" && method === "POST") {
    const response = await createItem(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

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
    const response = await validateOrder(req);

    const body = await response.json();
    return res.status(response.status).json(body);
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

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const responseBody = await response.json();
      return res.status(response.status).json(responseBody);
    } else {
      const responseText = await response.text();
      res.setHeader("Content-type", "application/xml");
      return res.status(response.status).send(responseText);
    }
  }
  if (method === "GET" && /\/orders\/[^/]+/.test(url)) {
    const response = await getOrder(req);
    const body = await response.json();

    return res.status(response.status).json(body);
  }

  if (method === "DELETE" && /\/orders\/[^/]+/.test(url)) {
    const response = await deleteOrder(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // PUT /orders
  if (method === "PUT" && /\/orders\/[^/]+/.test(url)) {
    const response = await updateOrder(req);
    const body = await response.json();

    return res.status(response.status).json(body);
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
