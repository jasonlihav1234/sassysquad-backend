import { describe, test, expect } from "bun:test";
import pg from "../../src/utils/db";
import {
  getUserIdByName,
  updateProfileQuery,
} from "../../src/database/queries/user_queries";
import { insertUser, deleteTestData } from "../test_helper";

describe("getUserIdByName", () => {
  test("returns null when no user has the given name", async () => {
    const result = await getUserIdByName("nonexistent-username");
    expect(result).toBeNull();
  });

  test("returns user_id when user with given name exists", async () => {
    const userName = `user-${crypto.randomUUID()}`;
    const user = await insertUser({ user_name: userName });

    const result = await getUserIdByName(userName);

    expect(result).toBe(user.user_id);

    await deleteTestData({ userIds: [user.user_id] });
  });
});

describe("updateProfileQuery", () => {
  test("returns 404 when user does not exist", async () => {
    const result = await updateProfileQuery(crypto.randomUUID(), {});

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  test("updates password when password is provided", async () => {
    const user = await insertUser({ user_name: `profile-${crypto.randomUUID()}` });

    const result = await updateProfileQuery(user.user_id, {
      password: "newSecurePassword123",
    });

    expect(result).not.toBeInstanceOf(Response);

    const rows = await pg`
      select password_hash from users where user_id = ${user.user_id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].password_hash).toBeDefined();
    expect(rows[0].password_hash).not.toBe("random_placeholder_string");

    await deleteTestData({ userIds: [user.user_id] });
  });

  test("returns empty array when no updates to apply", async () => {
    const user = await insertUser({ user_name: `noop-${crypto.randomUUID()}` });

    const result = await updateProfileQuery(user.user_id, {});

    expect(result).toEqual([]);

    await deleteTestData({ userIds: [user.user_id] });
  });

  test("updates biography when biography is provided", async () => {
    const user = await insertUser({ user_name: `bio-${crypto.randomUUID()}` });
    const text = "I love lamps.";

    const result = await updateProfileQuery(user.user_id, {
      biography: text,
    });

    expect(result).not.toBeInstanceOf(Response);

    const rows = await pg`
      select biography from users where user_id = ${user.user_id}
    `;
    expect(rows[0].biography).toBe(text);

    await deleteTestData({ userIds: [user.user_id] });
  });
});
