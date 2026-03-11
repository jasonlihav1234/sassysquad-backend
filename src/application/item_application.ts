import {
  jsonHelper,
  authHelper,
  revokeRefreshToken,
  AuthReq
} from "../utils/jwt_helpers";
import {
  verifyRefreshToken,
} from "../utils/jwt_config";
import {
  getAllItems,
  getItemsUser
} from "../database/queries/item_queries";

// look into responses
export const getItems = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const body = await req.json();
      const refreshToken = body.refreshToken;

      if (refreshToken) {
        const token = await verifyRefreshToken(refreshToken);
        await revokeRefreshToken(token.jwt_id as string);
      } else {
        return jsonHelper({
          message: "No refresh token passed in"
        }, 400);
      }
     
      let items = null;

      if (!body.userId) { // want all items
        items = await getAllItems();
      } else {
        items = await getItemsUser(
          body.userId
        );
      }

      if (items === null) {
        return jsonHelper({
          message: "No items found"
        }, 404);
      }

      return jsonHelper({
        message: "Items found",
        items: items
      });
    } catch (error) {
      return jsonHelper({
        message: "Items fetch failed",
        error: error
      }, 500);
    }
  }
);
