import {
  jsonHelper,
  authHelper,
  revokeRefreshToken,
  AuthReq,
} from "../utils/jwt_helpers";
import { verifyRefreshToken } from "../utils/jwt_config";
import {
  getAllItems,
  getItemByItemId,
  getItemsUser,
} from "../database/queries/item_queries";
import { VercelRequest } from "@vercel/node";

// look into responses
export const getItemsById = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // should follow /items/{id}, refresh token soould be passed by header
      const itemId = req.query.item_id as string | undefined;
      const userId = req.user!.subject_claim; // i know req won't be undefined

      let items = null;

      if (itemId) {
        // want all items
        items = await getItemByItemId(itemId);
      } else {
        items = await getItemsUser(userId);
      }

      if (items === null || (Array.isArray(items) && items.length === 0)) {
        return jsonHelper(
          {
            message: "No items found",
          },
          404,
        );
      }

      return jsonHelper({
        message: "Items found",
        items: items,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Items fetch failed",
          error: error,
        },
        500,
      );
    }
  },
);
