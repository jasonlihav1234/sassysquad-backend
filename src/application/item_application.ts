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
  getItemsUser,
  updateItemQuery
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

// update item
export const updateItem = authHelper(
  async(req: AuthReq, res: Response): Promise<Response> => {
    try {
      const body = await req.json();

      if (!body.item_id) {
        return jsonHelper({
          message: "No item ID provided"
        }, 400);
      }

      // need to have at least 1 field
      if (Object.keys(body).length < 2) {
        return jsonHelper({
          message: "No items provided"
        });
      }

      // map each field into null if undefined
      const response = await updateItemQuery(
        body.itemId,
        body.sellerId ?? null,
        body.itemName ?? null,
        body.description ?? null,
        body.price ?? null,
        body.quantity_available ?? null,
        body.image_url ?? null,
      );

      return res.status(200).json(response);
    } catch (error) {
      return jsonHelper({
        message: "Update item failed"
      }, 500);
    }
  }
);
