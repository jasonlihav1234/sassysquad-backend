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
  getUserBuyerOrders,
  getUserSellerOrders,
  isUserIdValid,
} from "../database/queries/user_queries";
import { VercelRequest } from "@vercel/node";
import { error } from "console";

// post with itemId and quantity and userId in body
export const addItemToCart = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // use the subject claim
      const userId = req.user?.subject_claim;
      const body = req.body;
      // cart should implicitly know that a item already exists since you can only
      // call this through the frontend which displays all already existing items
      if (!body.itemId || !body.quantity) {
        return jsonHelper(
          {
            error: "Need item ID and quantity in the body",
          },
          400,
        );
      }

      const [item] = await pg`
      select item_id, quantity_available
      from items
      where item_id = ${body.itemId}
      `;

      if (!item) {
        return jsonHelper({ error: "Item does not exist" }, 404);
      }

      if (item.quantity_available < body.quantity) {
        return jsonHelper({ error: "Not enough items in stock" }, 400);
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

      if (deleteAllItems) {
        const numDeleted = await redis.del(`cart:${userId}`);

        if (numDeleted === 0) {
          return jsonHelper({
            message: "No items in the cart to delete",
          });
        }
      } else {
        const numDeleted = await redis.hdel(`cart:${userId}`, itemId);

        if (numDeleted === 0) {
          return jsonHelper({
            message: "Item does not exist in the cart to delete",
          });
        }
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
    // quanatity should also not be higher than available
    const query =
      await pg`select quantity_available from items where item_id = ${itemId}`;
    if (query.length === 0) {
      return jsonHelper(
        {
          message: "Item does not exist",
        },
        404,
      );
    }
    const numAvailable = query[0].quantity_available;
    // checkout should have a final check as well
    if (body.length === 0 || body.quantity === undefined) {
      return jsonHelper(
        {
          message: "Quantity not provided to update cart item",
        },
        400,
      );
    } else if (body.quantity <= 0 || numAvailable < body.quantity) {
      return jsonHelper(
        {
          message: "Invalid quantity to set",
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
