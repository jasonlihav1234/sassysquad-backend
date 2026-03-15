import { describe, test, expect, spyOn } from "bun:test";
import { checkHealthConnectivity } from "../../src/database/queries/health_queries";
import * as dbModule from "../../src/utils/db";

describe("checkHealthConnectivity", () => {
  test("returns true when database query succeeds", async () => {
    const result = await checkHealthConnectivity();
    expect(result).toBe(true);
  });

  test("returns false when database query throws", async () => {
    const spy = spyOn(
      dbModule as Record<string, unknown>,
      "default",
    ) as ReturnType<typeof spyOn> & {
      mockRejectedValue: (value: unknown) => ReturnType<typeof spyOn>;
    };
    spy.mockRejectedValue(new Error("Connection refused"));

    const result = await checkHealthConnectivity();

    expect(result).toBe(false);
    spy.mockRestore();
  });
});
