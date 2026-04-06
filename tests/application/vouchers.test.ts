import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import pg, { redis } from "../../src/utils/db";
import { generateAuthenticatedRequest, registerAndLogin, resetDb, deleteTestData } from "../test_helper";
import { applyVoucher } from "../../src/application/order_application";

describe("voucher tests", () => {
  let userId: string | null = null;
  let accessToken: string | null = null;

  beforeEach(async () => {
    await resetDb();
    await redis.send("FLUSHDB", []);

    const user = await registerAndLogin("voucher@test.com", "voucherUser", "password");

    userId = user.userId;
    accessToken = user.accessToken;
  });

  afterEach(async () => {
    if (userId) {
      await deleteTestData({ userIds: [userId] });
    }
  });

  test("valid voucher gets applied and cached", async () => {
    const voucherId = crypto.randomUUID();

    await pg`insert into vouchers (voucher_id, code, discount_percent, usage_limit) values (${voucherId}, ${"SAVE10"}, ${10}, ${5})`;

    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", { code: "SAVE10" }, accessToken!);
    (req as any).user = { subject_claim: userId };

    const res = await applyVoucher(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe("Voucher applied");
    expect(data.discount_percent).toBe(10);

    const keys = await redis.keys("voucher:*");
    expect(keys.length).toBe(1);

    const redisValue = await redis.get(keys[0]);
    expect(redisValue).not.toBe(null);
  });

  test("missing voucher code should fail", async () => {
    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", {}, accessToken!);
    (req as any).user = { subject_claim: userId };

    const res = await applyVoucher(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Voucher code required");
  });

  test("random voucher code should return not found", async () => {
    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", { code: "NOTREAL123" }, accessToken!);
    (req as any).user = { subject_claim: userId };

    const res = await applyVoucher(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Invalid voucher");
  });

  test("expired voucher code should not apply", async () => {
    const voucherId = crypto.randomUUID();

    await pg`insert into vouchers (voucher_id, code, discount_percent, expires_at) values (${voucherId}, ${"OLD10"}, ${10}, ${new Date(Date.now() - 2000)})`;

    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", { code: "OLD10" }, accessToken!);
    (req as any).user = { subject_claim: userId };

    const res = await applyVoucher(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Voucher expired");
  });

  test("usage limit reached should block voucher", async () => {
    const voucherId = crypto.randomUUID();

    await pg`insert into vouchers (voucher_id, code, discount_percent, usage_limit, times_used) values (${voucherId}, ${"LIMIT10"}, ${10}, ${1}, ${1})`;

    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", { code: "LIMIT10" }, accessToken!);
    (req as any).user = { subject_claim: userId };

    const res = await applyVoucher(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Voucher usage limit reached");
  });

  test("voucher should be stored in redis with correct values", async () => {
    const voucherId = crypto.randomUUID();

    await pg`insert into vouchers (voucher_id, code, discount_percent) values (${voucherId}, ${"REDIS10"}, ${15})`;

    const req = generateAuthenticatedRequest("/vouchers/apply", "POST", { code: "REDIS10" }, accessToken!);
    (req as any).user = { subject_claim: userId };

    await applyVoucher(req);

    const keys = await redis.keys("voucher:*");
    expect(keys.length).toBe(1);

    const raw = await redis.get(keys[0]);
    expect(raw).not.toBe(null);

    const parsed = JSON.parse(raw!);

    expect(parsed.code).toBe("REDIS10");
    expect(parsed.discount_percent).toBe(15);
  });
});