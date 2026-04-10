import { brotliDecompressSync } from "node:zlib";
import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";
import {
  analyseImageForExtraction,
  callLLMFallback,
  enrichListing,
} from "./item_application";
import pg from "../utils/db";

async function callMLModel(tags: string, category: string): Promise<any> {
  const response = await fetch(
    `https://sassysquad-backend-production.up.railway.app/predict`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tags,
        category,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ML API error: ${response.status}`);
  }

  return await response.json();
}

export async function getPricing(
  productName: string,
  tags: string,
  category: string,
): Promise<any> {
  const CONFIDENCE_THRESHOLD = 0.5;

  let mlResult;

  try {
    mlResult = await callMLModel(tags, category);
  } catch (error) {
    console.log("ML model unreachable", error);

    const llm = await callLLMFallback(productName, tags, category);
    return { source: "llm", ...llm };
  }

  if (
    mlResult.status === "Success" &&
    mlResult.confidence >= CONFIDENCE_THRESHOLD
  ) {
    return {
      source: "ml",
      confidence: mlResult.confidence,
      warnings: mlResult.warnings,
      optimal_price: mlResult.optimal_price,
      max_expected_revenue: mlResult.max_expected_revenue,
      suggested_price_range: mlResult.suggested_price_range,
      expected_monthly_volume: mlResult.expected_monthly_volume,
    };
  }

  if (mlResult.staus === "No Market Demand") {
    return { source: "none", message: mlResult.message };
  }

  // low confidence
  const knownCategories =
    mlResult.status === "Insufficient data"
      ? mlResult.known_categories
      : undefined;

  const llm = await callLLMFallback(
    productName,
    tags,
    category,
    knownCategories,
  );

  return { source: "llm", ...llm };
}

export const agentProcess = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const { image } = req.body;

    if (!image) {
      return jsonHelper({ message: "Missing image" }, 400);
    }

    try {
      const draft = await processImage(image);
      return jsonHelper({
        message: "Draft generated",
        draft,
      });
    } catch (error: any) {
      if (error.message?.startsWith("Invalid image format")) {
        return jsonHelper(
          {
            message: error.message,
          },
          400,
        );
      }
      console.log("Agent failed ", error);
      return jsonHelper({ message: "Agent failed", error }, 500);
    }
  },
);

export const agentAccept = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const body = req.body;

    if (!body) {
      return jsonHelper(
        {
          message: "Missing request body",
        },
        400,
      );
    }
    // if it doesn't have a seller price must have a suggested price
    const finalPrice = body.sellerPrice ?? body.suggestedPrice;

    if (!finalPrice || finalPrice <= 0) {
      return jsonHelper(
        {
          message: "A valid price is required",
        },
        400,
      );
    }

    const userId = req.body.subject_claim;
    const quantity = body.quantityAvailable ?? 1;

    try {
      const [categoryRow] = await pg`
        select category_id
        from category
        where category_name = ${body.category}
        limit 1
      `;

      if (!categoryRow) {
        return jsonHelper(
          {
            message: `Category '${body.category}' not found`,
          },
          400,
        );
      }

      const [item] = await pg`
        insert into items (
          item_id,
          seller_id,
          item_name,
          description,
          price,
          quantity_available,
          image_url,
          created_at,
          last_updated,
          category_id
        ) values (
          ${crypto.randomUUID()},
          ${userId},
          ${body.title},
          ${body.description},
          ${finalPrice},
          ${quantity},
          ${body.imageBase64},
          ${categoryRow.category_id} 
        )
        returning item_id
      `;
    } catch (error) {}
  },
);

export async function processImage(imageBase64: string): Promise<any> {
  const extracted = await analyseImageForExtraction(imageBase64);
  const enriched = await enrichListing(
    extracted.name,
    extracted.category,
    extracted.tags,
  );
  // get the pricing if ml model is confident, else use the LLM fallback
  const pricing = await getPricing(
    extracted.name,
    extracted.tags,
    extracted.category,
  );

  const suggestedPrice =
    pricing.source === "ml"
      ? pricing.optimalPrice
      : pricing.source === "llm"
        ? pricing.midpoint
        : null;

  return {
    id: crypto.randomUUID(),
    imageBase64,
    title: enriched.title,
    description: enriched.description,
    tags: enriched.tags,
    category: extracted.category,
    pricing,
    suggestedPrice,
    quantityAvailable: 1, // can be chanaged by reviewer on board
  };
}
