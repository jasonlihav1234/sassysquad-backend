import { checkHealthConnectivity } from "../database/queries/health_queries";

export async function getHealth(req: any, res: any) {
  try {
    const databaseConnection = await checkHealthConnectivity();

    if (!databaseConnection) {
      return res.status(503).json({
        error: "SERVICE_UNAVAILABLE",
        message: "Temporarily lost connection to the database",
      });
    }

    return res.status(200).json({
      status: "OPERATIONAL",
      message: "Service and database are operational",
    });
  } catch {
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Unexpected error that prevented request to be fulfiled",
    });
  }
}
