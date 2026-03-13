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
} from "../database/queries/item_queries";
import { updateProfileQuery } from "../database/queries/user_queries";

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

export const updateProfile = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.user?.subject_claim as string;
      const body = req.body;

      if (!body.username && !body.email && !body.password) {
        return jsonHelper(
          {
            message: "No fields to update for the user",
          },
          400,
        );
      }

      await updateProfileQuery(userId, {
        user_name: body.username,
        email: body.email,
        password: body.password,
      });

      return jsonHelper({
        message: "Email successfully updated",
      });
    } catch (error) {
      return jsonHelper(
        { message: "Profile failed to update", error: error },
        500,
      );
    }
  },
);
