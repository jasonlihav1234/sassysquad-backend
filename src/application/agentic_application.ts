import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";
import { callLLMFallback } from "./item_application";

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
}

export const agentProcess = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const { image, mimeType, fileName } = req.body;

    if (!image || !mimeType || !fileName) {
      return jsonHelper(
        { message: "Missing iamge, mimeType or fileName" },
        400,
      );
    }

    try {
    } catch (error) {
      console.log("Agent failed ", error);
      return jsonHelper({ message: "Agent failed", error }, 500);
    }
  },
);

async function extractProductDetails(imageUrl: string): Promise<{
  name: string;
  category: string;
  tags: string;
  attributes: Record<string, string>;
}> {}

export async function processImage(
  imageBase64: string,
  mimeType: string,
  fileName: string,
): Promise<any> {
  const extracted = await extractProductDetails(imageBase64);
  const enriched = await enrichListing(extracted);
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
  };
}
