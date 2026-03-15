import { describe, test, expect, spyOn } from "bun:test";
import { getHealth } from "../src/application/health_application";
import * as healthQueries from "../src/database/queries/health_queries";
import { generateRequest } from "./test_helper";

describe("GET /health", () => {
  test("returns 200 when database is healthy", async () => {
    const spy = spyOn(
      healthQueries,
      "checkHealthConnectivity",
    ).mockResolvedValue(true);
    const req = generateRequest("/health", "GET", undefined);
    const response = await getHealth(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("OPERATIONAL");
    expect(body.message).toBe("Service and database are operational");
    spy.mockRestore();
  });

  test("returns 503 when database is unreachable", async () => {
    const spy = spyOn(
      healthQueries,
      "checkHealthConnectivity",
    ).mockResolvedValue(false);
    const req = generateRequest("/health", "GET", undefined);
    const response = await getHealth(req);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
    expect(body.message).toBe("Temporarily lost connection to the database");
    spy.mockRestore();
  });

  test("returns 500 when handler throws", async () => {
    const spy = spyOn(
      healthQueries,
      "checkHealthConnectivity",
    ).mockRejectedValue(new Error("Unexpected"));

    const req = generateRequest("/health", "GET", undefined);
    const response = await getHealth(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("INTERNAL_SERVER_ERROR");
    expect(body.message).toBe(
      "Unexpected error that prevented request to be fulfiled",
    );
    spy.mockRestore();
  });
});
