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
