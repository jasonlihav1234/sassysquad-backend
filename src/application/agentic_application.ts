import { authHelper, jsonHelper, AuthReq } from "../utils/jwt_helpers";

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

export async function processImage(
  imageBase64: string,
  mimeType: string,
  fileName: string,
): Promise<any> {
  let pricing = null;
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
