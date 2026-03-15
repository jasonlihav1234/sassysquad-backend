import { checkHealthConnectivity } from "../database/queries/health_queries";
import { jsonHelper } from "../utils/jwt_helpers";

export async function getHealth(req: any): Promise<Response> {
  try {
    const databaseConnection = await checkHealthConnectivity();

    if (!databaseConnection) {
      return jsonHelper(
        {
          error: "SERVICE_UNAVAILABLE",
          message: "Temporarily lost connection to the database",
        },
        503,
      );
    }

    return jsonHelper({
      status: "OPERATIONAL",
      message: "Service and database are operational",
    });
  } catch {
    return jsonHelper(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Unexpected error that prevented request to be fulfiled",
      },
      500,
    );
  }
}
