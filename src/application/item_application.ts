import {
  jsonHelper,
  authHelper,
  revokeRefreshToken,
  AuthReq,
} from "../utils/jwt_helpers";
import { verifyRefreshToken } from "../utils/jwt_config";
import {
  getAllItemsQuery,
  getItemByItemIdQuery,
  getItemsUserQuery,
  updateItemQuery,
  deleteItemFromIdQuery,
  createItemQuery,
  createItemQueryV2,
  updateItemQueryV2,
  addItemTagsQuery,
} from "../database/queries/item_queries";
import { updateProfileQuery } from "../database/queries/user_queries";

export const createItem = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const contentType = req.headers?.["content-type"];

      if (!contentType || !contentType.includes("application/json")) {
        return jsonHelper(
          {
            error: "UNSUPPORTED_TYPE",
            message: "This content type is not supported",
          },
          415,
        );
      }

      const sellerId = req.user?.subject_claim as string;
      const body = req.body || {};

      const { itemName, description, price, quantityAvailable, imageUrl } =
        body;

      if (
        !itemName ||
        typeof itemName !== "string" ||
        typeof price !== "number" ||
        price < 0 ||
        typeof quantityAvailable !== "number" ||
        quantityAvailable < 0
      ) {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      if (description !== undefined && typeof description !== "string") {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      if (imageUrl !== undefined && typeof imageUrl !== "string") {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      const itemId = crypto.randomUUID();
      const response = await createItemQuery(
        itemId,
        sellerId,
        itemName,
        description ?? null,
        price,
        quantityAvailable,
        imageUrl ?? null,
      );

      return jsonHelper(
        {
          message: "Item created successfully",
          item: response,
        },
        201,
      );
    } catch (error) {
      return jsonHelper(
        {
          message: "Creating item failed",
          error: error,
        },
        500,
      );
    }
  },
);

export const createItemV2 = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const contentType = req.headers?.["content-type"];

      if (!contentType || !contentType.includes("application/json")) {
        return jsonHelper(
          {
            error: "UNSUPPORTED_TYPE",
            message: "This content type is not supported",
          },
          415,
        );
      }

      const sellerId = req.user?.subject_claim as string;
      const body = req.body || {};

      const {
        itemName,
        description,
        price,
        quantityAvailable,
        imageUrl,
        categoryName,
        tags,
      } = body;
      // add a regex later for [a-z]-
      if (
        !itemName ||
        typeof itemName !== "string" ||
        typeof price !== "number" ||
        price < 0 ||
        typeof quantityAvailable !== "number" ||
        quantityAvailable < 0 ||
        !categoryName ||
        tags.length === 0
      ) {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      if (description !== undefined && typeof description !== "string") {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      if (imageUrl !== undefined && typeof imageUrl !== "string") {
        return jsonHelper(
          {
            error: "Bad Request",
            message: "Invalid/missing items fields",
          },
          400,
        );
      }

      const itemId = crypto.randomUUID();
      const response = await createItemQueryV2(
        itemId,
        sellerId,
        itemName,
        description ?? null,
        price,
        quantityAvailable,
        imageUrl ?? null,
        categoryName,
        tags,
      );

      return jsonHelper(
        {
          message: "Item created successfully",
          item: response,
        },
        201,
      );
    } catch (error) {
      return jsonHelper(
        {
          message: "Creating item failed",
          error: error,
        },
        500,
      );
    }
  },
);

// look into responses
export const getItemsById = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // should follow /items/{id}, refresh token soould be passed by header
      const itemId = req.url?.split("/").pop() as string;
      const items = await getItemByItemIdQuery(itemId);

      if (items.length === 0) {
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

export const getItemByUserId = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.url?.split("/").at(2) as string; // I know that req.user won't be undefined
      console.log(req.url, req.url?.split("/"));
      const response = await getItemsUserQuery(userId);

      if (response.length === 0) {
        return jsonHelper(
          {
            message: "No items found",
          },
          404,
        );
      }

      return jsonHelper({
        message: "Items found",
        items: response,
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        { message: "Getting items by user id failed", error: error },
        500,
      );
    }
  },
);

export const getAllItems = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const response = await getAllItemsQuery();

      if (response.length === 0) {
        return jsonHelper(
          {
            message: "No items found",
          },
          404,
        );
      }

      return jsonHelper({
        message: "Items successfully fetched",
        items: response,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Getting all items failed to fetch",
          error: error,
        },
        500,
      );
    }
  },
);

// update item
export const updateItem = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const itemId = req.url?.split("/").at(2) as string;
      const body = req.body;

      // need to have at least 1 field
      if (Object.keys(body).length < 2) {
        return jsonHelper({
          message: "No item fields to update provided",
        });
      }

      // map each field into null if undefined
      const response = await updateItemQueryV2(
        itemId,
        body.itemName ?? null,
        body.description ?? null,
        body.price ?? null,
        body.quantity_available ?? null,
        body.image_url ?? null,
        body.categoryName ?? null,
      );

      return jsonHelper({
        message: "Item successfully updated",
        response: response,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Update item failed",
          error: error,
        },
        500,
      );
    }
  },
);

// delete item
export const deleteItem = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      // need to extract the item id from the param not the body
      const itemId = req.url?.split("/").at(2) as string;
      const response = await deleteItemFromIdQuery(itemId);

      return jsonHelper({
        message: "Item deleted",
        response: response,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Deleting item failed",
          error: error,
        },
        500,
      );
    }
  },
);

export const addItemTags = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const itemId = req.body.itemId;
      const tags = req.body.tags;

      if (!itemId || !tags || tags.length === 0) {
        return jsonHelper(
          {
            message: "No itemId or tags provided",
          },
          400,
        );
      }

      await addItemTagsQuery(itemId, tags);

      return jsonHelper({
        message: "Tag added to item"
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Adding item tag failed",
          error: error,
        },
        500,
      );
    }
  },
);
