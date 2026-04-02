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
} from "../database/queries/item_queries";
import { GoogleGenAI } from "@google/genai";
import { updateProfileQuery } from "../database/queries/user_queries";
import pg from "../utils/db";
import { z, toJSONSchema } from "zod";
import * as ort from "onnxruntime-web";
import murmurhash3 from "murmurhash3js";

const VECTOR_SIZE = 65536;
let session: ort.InferenceSession | null = null;
let metadata = null;
const ai = new GoogleGenAI({});

const responseSchema = z.object({
  tags: z.array(z.string()),
  message: z.string().describe("Message the LLM responds with"),
});

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

async function fetchPrivateModelBuffer(): Promise<any> {
  console.log("Cold start");
  const modelUrl =
    "https://dxf4or0l3oqv7qxa.private.blob.vercel-storage.com/onnx_files/saasysquad_model.onnx";
  const metadataUrl =
    "https://dxf4or0l3oqv7qxa.private.blob.vercel-storage.com/onnx_files/model_metadata.json";

  const [response, metadataResponse] = await Promise.all([
    await fetch(modelUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    }),
    await fetch(metadataUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    }),
  ]);

  if (!response.ok || !metadataResponse.ok) {
    throw new Error("Failed to fetch ML model");
  }

  const [model, metadata] = await Promise.all([
    response.arrayBuffer(),
    metadataResponse.json(),
  ]);

  return {
    model: model,
    metadata: metadata,
  };
}

export async function predictOptimalPrice(
  tags: string[],
  minPrice: number,
  maxPrice: number,
  step: number = 1.0
) {
  if (!session) {
    const modelBuffer = await fetchPrivateModelBuffer();
    session = await ort.InferenceSession.create(modelBuffer.model);
    metadata = modelBuffer.metadata;
  }

  let bestPrice = 0;
  let maxRevenue = 0;
  let bestVolume = 0;

  const testedPrices = [];
  const projectedRevenues = [];
  const predictedVolumes = [];

  let currPrice = minPrice;
  while (currPrice <= maxPrice) {
    const vector = new Float32Array(VECTOR_SIZE);
    vector[0] = currPrice;

    for (const tag of tags) {
      const cleanTag = tag.toLowerCase().trim();
      const hash_index =
        (murmurhash3.x86.hash32(cleanTag) % (VECTOR_SIZE - 1)) + 1;
      vector[hash_index] = 1.0;

      const tensor = new ort.Tensor("float32", vector, [1, VECTOR_SIZE]);
      const rawPredict = await session.run({ float_input: tensor });
      const volume = Math.max(0, Math.trunc(rawPredict.variable.data[0] as number));
      const revenue = currPrice * volume;

      testedPrices.push(currPrice);
      projectedRevenues.push(revenue);
      predictedVolumes.push(volume);

      if (revenue > maxRevenue) {
        maxRevenue = revenue;
        bestPrice = currPrice;
        bestVolume = volume;
      }

      currPrice += step
    }
  }
}

export async function predictVolume(price: number, tags: string[]) {
  if (!session) {
    const modelBuffer = await fetchPrivateModelBuffer();
    session = await ort.InferenceSession.create(modelBuffer.model);
    metadata = modelBuffer.metadata;
  }

  // user supplies the tag and body price, or it can be pulled from the persons current listing
  // const price = req.body.price;
  // const tags = req.body.tags;

  if (price > metadata!.P99_PRICE) {
    return metadata!.OUTLIER_AVG_VOLUME;
  }

  const vector = new Float32Array(VECTOR_SIZE);
  vector[0] = price;

  for (const tag of tags) {
    const cleanTag = tag.toLowerCase().trim();
    const hash_index =
      (murmurhash3.x86.hash32(cleanTag) % (VECTOR_SIZE - 1)) + 1;
    vector[hash_index] = 1.0;
  }

  const tensor = new ort.Tensor("float32", vector, [1, VECTOR_SIZE]);
  const results = await session.run({ float_input: tensor });

  const finalVolume = Math.max(
    0,
    Math.trunc(results.variable.data[0] as number),
  );

  return finalVolume;
}

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
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: toJSONSchema(responseSchema),
        },
      });

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
