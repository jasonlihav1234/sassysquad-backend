import {
  config,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt_config";
import { type JWTPayload } from "jose";
import bcrypt from "bcrypt";
import pg, { redis } from "../utils/db";
import {
  jsonHelper,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshTokenSession,
  revokeRefreshToken,
  getAuthenticatedUserId,
  authHelper,
  AuthReq,
  revokeAllUserRefreshTokens,
} from "../utils/jwt_helpers";
import nodemailer from "nodemailer";
import path from "path";
import {
  getOrderById,
} from "../database/queries/order_queries";
import {
  getUserBuyerOrders,
  getUserSellerOrders,
  isUserIdValid,
} from "../database/queries/user_queries";
import { VercelRequest } from "@vercel/node";

// post with itemId and quantity and userId in body
export const addItemToCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // use the subject claim
      const userId = req.user?.subject_claim;
      const body = req.body;

      if (!body.itemId || !body.quantity) {
        return jsonHelper(
          {
            error: "Need item ID and quantity in the body",
          },
          400,
        );
      }
      // users should share carts between devices
      const key = `cart:${userId}`;
      await redis.hset(key, body.itemId, body.quantity);
      await redis.expire(key, 86400); // cart expires in 1 day

      return jsonHelper({
        message: "Item successfully added to cart",
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Item failed to add to cart",
          error: error,
        },
        500,
      );
    }
  },
);

export const deleteItemFromCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const splitUrl = req?.url?.split("/");
      let deleteAllItems = false;
      const userId = req.user?.subject_claim;

      // case of /cart
      if (splitUrl?.length === 2) {
        deleteAllItems = true;
      }
      const itemId = splitUrl?.at(3) as string;
      const body = req.body;

      if (!body.itemId) {
        return jsonHelper(
          {
            message: "Item ID not given",
          },
          400,
        );
      }

      if (deleteAllItems) {
        await redis.del(`cart:${userId}`);
      } else {
        await redis.hdel(`cart:${userId}`, itemId);
      }

      return jsonHelper({
        message: "Item/s successfully removed from cart",
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Item/s failed to remove from cart",
          error: error,
        },
        500,
      );
    }
  },
);

// in a cart you can only change the quantity of an item
export const updateCartItem = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const itemId = req.url?.split("/").at(3) as string;
    const userId = req.user?.subject_claim;
    const body = req.body;

    // body will have updated fields
    if (body.length === 0) {
      return jsonHelper(
        {
          message: "Quantity not provided to update cart items",
        },
        400,
      );
    }

    try {
      const quantity = body.quantity;
      const key = `cart:${userId}`;
      await redis.hset(`cart:${userId}`, itemId, quantity);
      await redis.expire(key, 86400);

      return jsonHelper({
        message: "Item successfully updated",
      });
    } catch (error) {
      console.log(error);

      return jsonHelper(
        {
          message: "Item failed to update",
          error: error,
        },
        500,
      );
    }
  },
);

// gets an order given its id
export const listOrder = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const orderId = req.url?.split("/").at(3) as string;
    const userId = req.user?.subject_claim;

    if (!orderId) {
      return jsonHelper(
        {
          message: "OrderID invalid.",
          error: "Bad Request",
        },
        400,
      );
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return jsonHelper(
        {
          message: "Order not found.",
          error: "Not Found",
        },
        404,
      );
    }

    if (userId !== order.buyerId) {
      return jsonHelper(
        {
          message: "User does not have permission to delete order.",
          error: "Unauthorised",
        },
        403,
      );
    }
    
    return jsonHelper({
      order: order
    });
  },
);
