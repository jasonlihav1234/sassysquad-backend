import { create } from "xmlbuilder2";
import {
  createOrderQuery,
  getOrderById,
  updateOrdersById,
} from "./database/queries/order_queries";
import {
  applyVoucher,
  cancelSubscription,
  createSubscriptionSession,
  getCart,
} from "./application/order_application";
import googleCallback, {
  register,
  login,
  refresh,
  forgotPasswordV1,
  forgotPasswordV2,
  resetPassword,
  logout,
  logoutAll,
  getUserSessions,
  getUserDetailsById,
  getMyProfileDetails,
  deleteUser,
  updateProfile,
  googleLogin,
  addTwoFactor,
  verifyTwoFactor,
  updateSubscription,
  addSavedItem,
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
  getItemReviews,
  createItemV2,
  addItemTags,
  deleteItemTags,
  generateAIRecommendations,
  getMarketEstimate,
  getAllCategories,
  getAllTags,
} from "./application/item_application";
import { agentProcess, agentAccept } from "./application/agentic_application";
import { deleteItemTagsQuery } from "./database/queries/item_queries";
import { UnexpectedResponseError } from "arctic";
import { ur } from "zod/locales";
import { getBasicAnalytics, getEnterpriseAnalytics, getProAnalytics } from "./application/analytics_application";

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
          
          /* Login Button Styles */
          .login-btn {
            margin-top: 20px;
            padding: 12px 24px;
            background-color: #4285F4;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            transition: background-color 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 10px;
          }
          .login-btn:hover {
            background-color: #357ae8;
          }
          .token-display {
            margin-top: 20px;
            padding: 15px;
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            border-radius: 8px;
            max-width: 80%;
            word-break: break-all;
            font-family: monospace;
          }
          .hidden { display: none; }
        </style>
      </head>
      <body>
        <h1>You've Reached The Root Of SaasySquad :O</h1>
        
        <a href="https://jasonlihav1234.github.io/sassysquad-backend/api-docs/" target="_blank" rel="noopener noreferrer">Our Swagger API</a>

        <div id="auth-section">
          <a href="/auth/google/login" class="login-btn">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.712s.102-1.173.282-1.712V4.956H.957a8.991 8.991 0 000 8.088l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.956L3.964 7.29C4.672 3.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
            Sign in with Google
          </a>
        </div>

        <div id="token-section" class="hidden">
          <p style="color: green; font-weight: bold;">✓ Authenticated successfully!</p>
          <div class="token-display" id="token-data"></div>
        </div>

        <div class="gif-container">
          <img src="https://media1.tenor.com/m/JHuU14ekU3EAAAAd/ishowspeed-deglove.gif" alt="SaasySquad GIF 1" />
          <img src="https://i.makeagif.com/media/11-08-2024/HSMtFe.gif" alt="SaasySquad GIF 2" />
        </div>

        <script>
          // Automatically check for a token in the URL hash (from your callback redirect)
          window.addEventListener('load', () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get("access_token");

            if (accessToken) {
              // Hide login, show token
              document.getElementById('auth-section').classList.add('hidden');
              const tokenSection = document.getElementById('token-section');
              tokenSection.classList.remove('hidden');
              document.getElementById('token-data').innerText = "Access Token: " + accessToken;

              // Clear the hash from URL for cleanliness
              window.history.replaceState(null, "", "/");
            }
          });
        </script>
      </body>
    </html>
    `);
  }

  if (url === "/v1/analytics/basic" && method === "GET") {
    const response = await getBasicAnalytics(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/subscription/checkout" && method === "POST") {
    const response = await createSubscriptionSession(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/analytics/pro" && method === "GET") {
    const response = await getProAnalytics(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/analytics/enterprise" && method === "GET") {
    const response = await getEnterpriseAnalytics(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }
  
  if (url === "/v1/subscription/cancel" && method === "POST") {
    const response = await cancelSubscription(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/users/subscription" && method === "PATCH") {
    const response = await updateSubscription(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/agent/process" && method === "POST") {
    const response = await agentProcess(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/agent/accept" && method === "POST") {
    const response = await agentAccept(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v1/pricing/estimate" && method === "POST") {
    const response = await getMarketEstimate(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/items/recommendations" && method === "POST") {
    const response = await generateAIRecommendations(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/items/tags" && method === "POST") {
    const response = await addItemTags(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (
    url.match(/^\/items\/[a-zA-Z0-9_-]+\/tags(\?.*)?$/) &&
    method === "DELETE"
  ) {
    const response = await deleteItemTags(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/google/login" && method === "GET") {
    return await googleLogin(req, res);
  }

  if (url.startsWith("/auth/google/callback") && method === "GET") {
    return await googleCallback(req, res);
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
    const response = await forgotPasswordV1(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v2/auth/forgot-password" && method === "POST") {
    const response = await forgotPasswordV2(req);

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

  if (url.match(/^v2\/items\/[a-zA-Z0-9_-]+$/) && method === "PATCH") {
    const response = await updateItem(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/cart/items" && method === "POST") {
    const response = await addItemToCart(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/saved" && method === "POST") {
    const response = await addSavedItem(req);

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

  if (url === "/categories" && method === "GET") {
    const response = await getAllCategories(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/tags" && method === "GET") {
    const response = await getAllTags(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/v2/items" && method === "POST") {
    const response = await createItemV2(req);

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

  if (url === "/cart" && method === "GET") {
    const response = await getCart(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url.match(/^\/cart\/items\/[a-zA-Z0-9_-]+$/) && method === "PATCH") {
    const response = await updateCartItem(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // /items/{item_id}/review
  if (url.match(/^\/items\/[a-zA-Z0-9_-]+\/review$/) && method === "GET") {
    const response = await getItemReviews(req);

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

  if (url.startsWith("/checkout-session-status") && method === "GET") {
    const response = await checkCheckoutSessionStatus(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (
    (url.match(/^\/users\/[a-zA-Z0-9_-]+\/purchases/) ||
      url.match(/^\/users\/[a-zA-Z0-9_-]+\/sales/) ||
      url.match(/^\/users\/[a-zA-Z0-9_-]+\/saved/)) &&
    method === "GET"
  ) {
    return handleUserRoutes(req, res);
  }

  if (url === "/health" && method === "GET") {
    return handleHealthRoutes(req, res);
  }

  if (url === "/auth/2fa/verify" && method === "POST") {
    const response = await verifyTwoFactor(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/auth/2fa/add" && method === "POST") {
    const response = await addTwoFactor(req);

    const body = await response.json();
    return res.status(response.status).json(body);
  }

  if (url === "/vouchers/apply" && method === "POST") {
    const response = await applyVoucher(req);
    const body = await response.json();
    return res.status(response.status).json(body);
  }

  // 404 if no roiutes match
  return res.status(404).json({ error: "Not found" });
}
