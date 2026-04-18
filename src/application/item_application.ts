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
  deleteItemTagsQuery,
  fetchTaggedCategoryItem,
  getAllCategoriesQuery,
  getAllTagsQuery,
  getItemTagsByItemIdQuery,
  getSellerUsernameBySellerIdQuery,
} from "../database/queries/item_queries";
import { GoogleGenAI } from "@google/genai";
import { updateProfileQuery } from "../database/queries/user_queries";
import pg from "../utils/db";
import { z, toJSONSchema } from "zod";
import { isMainThread } from "node:worker_threads";

const ai = new GoogleGenAI({});

const responseSchema = z.object({
  tags: z.array(z.string()),
  message: z.string().describe("Message the LLM responds with"),
});

const extractionSchema = z.object({
  name: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
});

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

const llmFallbackSchema = z.object({
  price_low: z.number(),
  price_high: z.number(),
  reasoning: z.string(),
});

const enrichmentSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

async function withRetry(
  func: any,
  maxRetries: number = 5,
  baseDelay: number = 2000,
) {
  for (let i = 0; i <= maxRetries; ++i) {
    try {
      return await func();
    } catch (error: any) {
      if (i === maxRetries || ![503, 429].includes(error?.status)) throw error;
      // random delay before looping again
      const backoff = baseDelay * 2 ** i;
      const delay = Math.random() * backoff; 
      
      console.warn(`Retrying... Attempt ${i + 1}. Status ${status}. Delay: ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Unreachable");
}

export async function callLLMFallback(
  productName: string,
  tags: string,
  category: string,
  knownCategories?: string[],
): Promise<any> {
  const categoryHint = knownCategories?.length
    ? `Known categorieson this marketplace: ${knownCategories.slice(0, 10).join(", ")}.`
    : "";

  const prompt = `
  You are a marketplace pricing expert optimising for maximum revenue.
  The ML pricing model has insufficient sales history for this item.

  Product: ${productName}
  Category: ${category}
  Tags: ${tags}
  ${categoryHint}

  Suggest a realistic retail price range that maximises revenue based on comparable goods.
  Return ONLY this JSON format:
  {
    "price_low": number,
    "price_high": number,
    "reasoning": "one sentence explaination"
  }`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [prompt],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: toJSONSchema(llmFallbackSchema),
      },
    }),
  );

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  const parsed = llmFallbackSchema.parse(JSON.parse(response.text));

  const low = Math.round(parsed.price_low);
  const high = Math.round(parsed.price_high);

  return {
    price_range: [low, high],
    midpoint: Math.round((low + high) / 2),
    reasoning: parsed.reasoning,
  };
}

export async function enrichListing(
  name: string,
  category: string,
  tags: string,
): Promise<any> {
  const prompt = `
  Write a product listing optimised for maximum revenue.

  Product: ${name}
  Category: ${category}
  Tags: ${tags}
  
  Return ONLY this JSON format:
  {
    "title": "string (max 80 chars, SEO optimised)",
    "description": "string (150-200 words)",
    "tags": ["array", "of", "8", "strings"]
  }
  `;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [prompt],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: toJSONSchema(enrichmentSchema),
      },
    }),
  );

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  return enrichmentSchema.parse(JSON.parse(response.text));
}

export async function analyseImageForExtraction(
  image: string, // assume in base64
): Promise<{ name: string; category: string; tags: string }> {
  const imageTypeMatch = image.match(/^data:(image\/(jpeg|png|webp));base64,/);
  if (!imageTypeMatch) {
    throw Error("Invalid image format. Please upload a JPEG, PNG, or WEBP.");
  }

  const imageType = imageTypeMatch[1];
  const rawImage = image.replace(/^data:image\/\w+;base64,/, "");
  const [categoriesQuery, tagsQuery] = await Promise.all([
    pg`select category_name from categories`,
    pg`select tag_name from tags`,
  ]);

  // extracting the names of the category and tags
  const categories = categoriesQuery.map((c: any) => c.category_name);
  const tags = tagsQuery.map((t: any) => t.tag_name);

  const prompt = `
  You are a product listing expert for a luxury marketplace.

  Allowed categories: ${categories.join(", ")}
  Allowed tags: ${tags.join(", ")}

  Analyse the provided product image and extract the following details.

  CRITICAL INSTRUCTIONS:
  - category MUST be chosen from the allowed categories list exactly as written
  - tags MUST only be chosen from the allowed tags list exactly as written
  - Do not invent new categories or tags

  Return ONLY this JSON format:
  {
    "name": "short descriptive product name",
    "category": "one category from the allowed list",
    "tags": ["tag1", "tag2"]
  }
  `;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [
        prompt,
        { inlineData: { mimeType: imageType, data: rawImage } },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: toJSONSchema(extractionSchema),
      },
    }),
  );

  if (!response.text) {
    throw new Error("No text response from Gemini");
  }

  const parsed = extractionSchema.parse(JSON.parse(response.text));

  return {
    name: parsed.name,
    category: parsed.category,
    tags: parsed.tags.join(","),
  };
}

export const getMarketEstimate = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const tags = req.body.tags;
    const category = req.body.category;

    if (!tags || !category) {
      return jsonHelper(
        {
          message: "Tags or category not provided",
        },
        400,
      );
    }

    try {
      const RAILWAY_URL =
        "https://sassysquad-backend-production.up.railway.app";
      const response = await fetch(`${RAILWAY_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, category }),
      });

      if (!response.ok) {
        const body = await response.json();
        console.log(body);
        return jsonHelper(
          {
            error: body,
          },
          response.status,
        );
      }

      return jsonHelper({
        message: "Prediction completed",
        prediction: await response.json(),
      });
    } catch (error) {
      return jsonHelper(
        {
          error: error,
        },
        500,
      );
    }
  },
);

export const generateAIRecommendations = authHelper(
  async (req: AuthReq): Promise<Response> => {
    // get all the tags that exist in the database
    // user chooses category of item
    const category = req.body.category;
    const image = req.body.image;

    if (!category || !image) {
      return jsonHelper(
        {
          message: "No image or category provided",
        },
        400,
      );
    }

    const imageTypeMatch = image.match(
      /^data:(image\/(jpeg|png|webp));base64,/,
    );
    if (!imageTypeMatch) {
      return jsonHelper(
        {
          message: "Invalid image format. Please upload a JPEG, PNG, or WEBP.",
        },
        400,
      );
    }

    const imageType = imageTypeMatch[1];
    const rawImage = image.replace(/^data:image\/\w+;base64,/, "");

    // need to strip the base 64 starting of the string, gemini wants raw string

    // need to get all the tags
    const tagsQuery = await pg`select tag_name from tags`;

    if (tagsQuery.length === 0) {
      return jsonHelper(
        {
          message: "No tags exist",
        },
        404,
      );
    }

    const tags = tagsQuery.map((tag: any) => tag.tag_name);
    // I would need base64 encoded image
    const prompt = `
    You are an expert interior design consultant.
    These are the allowed aesthetic tags: ${tags.join(", ")}

    Analyze the provided image and select the tags from the list that perfectly fit the theme and aesthetic of the customer's room.
    This if for a high-end, luxury business, so curate your choices carefully to delight the customer.

    CRITICAL INSTRUCTION: You must ONLY choose tags that exist in the exact list provided above. DO NOT invent new tags.

    You MUST return your response in the following strict JSON format:
    {
      "tags": ["tag1", "tag2", etc...],
      "message": "A short, polite message explaining why you chose these tags."
    }

    If absolutely none of the tags fit the image, return an empty array for the tags and provide your alternative style suggestions inside the message key like this:
    {
      "tags": [],
      "message": "I couldn't find exact matches in our current catalog, but I think 'Wabi-Sabi' or 'Mid-Century Modern' would fit this space perfectly :)"
    }
    `;

    const contents = [
      prompt,
      {
        inlineData: {
          mimeType: imageType,
          data: rawImage,
        },
      },
    ];
    // https://ai.google.dev/gemini-api/docs/structured-output?example=recipe
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: contents,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: toJSONSchema(responseSchema),
          },
        }),
      );

      if (!response.text) {
        throw Error("No text response given");
      }

      // from response, parse the json, if empty, return the message, else query the database for items that
      // match any of the tags and category
      const messageTag = responseSchema.parse(JSON.parse(response.text));
      console.log(messageTag);

      if (messageTag.tags.length === 0) {
        return jsonHelper({
          message: messageTag.message,
        });
      }

      // else contains tags
      const items = await fetchTaggedCategoryItem(category, messageTag.tags);

      if (items.length === 0) {
        const formattedTagString = listFormatter.format(messageTag.tags);
        return jsonHelper({
          message: `I couldn't find exact matches in our current catalog, but I think ${formattedTagString} would fit this space perfectly :).`,
        });
      }

      return jsonHelper({
        message: messageTag.message,
        items: items,
      });
    } catch (error) {
      console.log(error);

      return jsonHelper(
        {
          message: "Prompt failed",
          error: error,
        },
        500,
      );
    }
  },
);

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
      const userId = req.user?.subject_claim;

      if (items.length === 0) {
        return jsonHelper(
          {
            message: "No items found",
          },
          404,
        );
      }

      if (userId !== items[0].seller_id) {
        pg`
        insert into item_views (view_id, item_id, viewer_id, viewed_at)
        values (gen_random_uuid(), ${items[0].item_id}, ${userId ?? null}, now())
        `.catch((error: any) => console.log("view tracking failed", error));
      }

      const itemTags = await getItemTagsByItemIdQuery(itemId);
      const itemsWithTags = items.map((item: any) => ({
        ...item,
        itemTags: itemTags,
      }));

      return jsonHelper({
        message: "Items found",
        items: itemsWithTags,
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

      const sellerUsernames = await Promise.all(
        response.map((item: any) =>
          getSellerUsernameBySellerIdQuery(item.seller_id),
        ),
      );

      const itemsWithSellerUsername = response.map(
        (item: any, index: number) => ({
          ...item,
          seller_user_name: sellerUsernames[index],
        }),
      );

      return jsonHelper({
        message: "Items successfully fetched",
        items: itemsWithSellerUsername,
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

export const getAllCategories = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const response = await getAllCategoriesQuery();

      if (response.length === 0) {
        return jsonHelper(
          {
            message: "No categories found",
          },
          404,
        );
      }

      return jsonHelper({
        message: "Categories successfully fetched",
        categories: response,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Getting all categories failed",
          error: error,
        },
        500,
      );
    }
  },
);

export const getAllTags = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const response = await getAllTagsQuery();

      if (response.length === 0) {
        return jsonHelper(
          {
            message: "No tags found",
          },
          404,
        );
      }

      return jsonHelper({
        message: "Tags successfully fetched",
        tags: response,
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Getting all tags failed",
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

      const item = await getItemByItemIdQuery(itemId);

      if (item.length === 0) {
        return jsonHelper(
          {
            message: "Item not found",
          },
          404,
        );
      }

      if (item[0].seller_id != req.user!.subject_claim) {
        return jsonHelper(
          {
            message: "User does not own the item",
          },
          401,
        );
      }

      await addItemTagsQuery(itemId, tags);

      return jsonHelper({
        message: "Tag added to item",
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

export const deleteItemTags = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const itemId = req.url!.split("/").at(2);
      const tags = req.query.tags;

      if (!itemId || !tags) {
        return jsonHelper(
          {
            message: "No itemId or tags are not provided",
          },
          400,
        );
      }

      if (tags.length === 0) {
        return jsonHelper(
          {
            message: "Tags are empty",
          },
          400,
        );
      }

      const tagString = Array.isArray(tags) ? tags.join(",") : tags;
      const tagArray = tagString.split(",").map((tag) => tag.trim());

      await deleteItemTagsQuery(itemId as string, tagArray);

      return jsonHelper({
        message: "Tags removed from item",
      });
    } catch (error) {
      return jsonHelper(
        {
          message: "Removing item tags failed",
          error: error,
        },
        500,
      );
    }
  },
);
