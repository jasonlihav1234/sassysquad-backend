import { expect, test, describe, spyOn, beforeAll, afterAll } from "bun:test";
import {
  generateUser,
  register,
  refresh,
  login,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  getUserPurchases,
  getUserSales,
} from "../src/application/user_application";
import { afterEach, beforeEach } from "node:test";
import pg, { redis } from "../src/utils/db";
import { createHash } from "node:crypto";
import { verifyRefreshToken, createAccessToken } from "../src/utils/jwt_config";
import {
  generateRequest,
  generateAuthenticatedRequest,
  insertUser,
  insertOrder,
  resetDb,
} from "./test_helper";

beforeAll(async () => {
  await pg`delete from refresh_tokens`;
  await pg`delete from items`;
  await pg`delete from users`;
});

const registerRoute = "http://localhost/auth/register";
const logoutRoute = "http://localhost/auth/logout";
const refreshRoute = "http://localhost/auth/refresh";
const loginRoute = "http://localhost/auth/login";
const logoutAllRoute = "http://localhost/auth/logout-all";

afterEach(async () => {
  await resetDb();
});

describe("Register User", () => {
  const registerRoute = "http://localhost/auth/register";

  test("Email not provided", async () => {
    const request = generateRequest(registerRoute, "POST", {
      username: "awdjbadadjkwbn",
      password: "akwdhadw",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Email, password, and username required");
  });

  test("Username not provided", async () => {
    const request = generateRequest(registerRoute, "POST", {
      email: "test@gmail.com",
      password: "dajkwhdaj",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Email, password, and username required");
  });

  test("Password not provided", async () => {
    const request = generateRequest(registerRoute, "POST", {
      email: "tesing@gmail.com",
      username: "aiohdaadw",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Email, password, and username required");
  });

  test("Password length invalid", async () => {
    const request = generateRequest(registerRoute, "POST", {
      email: "tesing@gmail.com",
      username: "test",
      password: "1234",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Password must be at least 7 characters long");
  });

  test("User already exists", async () => {
    const email = "testing@gmail.com";

    await pg`delete from users where email = ${email}`;

    await generateUser(email, "test", "password123");

    const request = generateRequest(registerRoute, "POST", {
      email: email,
      username: "test",
      password: "password123",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(409);
    expect(message.error).toBe("User with this email already exists");

    await pg`delete from users where email = ${email}`;
  });

  test("Successfully create user", async () => {
    const email = "testing@gmail.com";

    await pg`delete from users where email = ${email}`;

    const request = generateRequest(registerRoute, "POST", {
      email: email,
      username: "test",
      password: "password123",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(201);
    expect(message.message).toBe("User has been created");

    const user = await pg`select * from users where email = ${email}`;
    expect(user.length).toBe(1);

    await pg`delete from users where email = ${email}`;
  });
});

describe("Login User", () => {
  const loginRoute = "http://localhost/auth/login";

  test("User does not exist", async () => {
    const request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "abc1234",
    });

    const response = await login(request);
    const message = await response.json();
    expect(response.status === 401);
    expect(message.error).toBe("Invalid credentials");
  });

  test("Email not provided", async () => {
    const request = generateRequest(loginRoute, "POST", {
      password: "testdahdjaw",
    });

    const response = await login(request);
    const message = await response.json();
    expect(response.status === 400);
    expect(message.error).toBe("Email and password required");
  });

  test("Password not provided", async () => {
    const request = generateRequest(loginRoute, "POST", {
      email: "testdahdjaw",
    });

    const response = await login(request);
    const message = await response.json();
    expect(response.status).toBe(400);
    expect(message.error).toBe("Email and password required");
  });

  test("User gets logged in", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const userResponse = await register(request);
    const userBody = await userResponse.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const response = await login(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accessToken).not.toBe(undefined);
    expect(body.refreshToken).not.toBe(undefined);
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(600);

    const query =
      await pg`select * from refresh_tokens where user_id = ${userBody.user}`;

    expect(query.length).toBe(1);

    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
  });
});

describe("Refresh token test", () => {
  const refreshRoute = "http://localhost/auth/refresh";
  const loginRoute = "http://localhost/auth/login";

  test("No refresh token provided", async () => {
    const request = generateRequest(refreshRoute, "POST", {
      invalidField: "byeol",
    });

    const response = await refresh(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Refresh token required");
  });

  test("Invalid refresh token", async () => {
    const request = generateRequest(refreshRoute, "POST", {
      refreshToken: "akwdnkjawdaljnbda",
    });

    const response = await refresh(request);
    const message = await response.json();

    expect(response.status).toBe(401);
    expect(message.error).toBe("Refresh token is invalid");
  });

  test("Refresh token does not exist", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const user = await register(request);
    const userBody = await user.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const response = await login(request);
    const loginBody = await response.json();
    // delete the refresh token, current holding one still has valid issuer
    await pg`delete from refresh_tokens where user_id = ${userBody.user}`;

    request = generateRequest(refreshRoute, "POST", {
      refreshToken: loginBody.refreshToken,
    });

    const refreshResponse = await refresh(request);
    const refreshBody = await refreshResponse.json();

    expect(refreshResponse.status).toBe(401);
    expect(refreshBody.error).toBe("Refresh token does not exist");
  });

  test("Refresh token revoked", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const user = await register(request);
    const userBody = await user.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const response = await login(request);
    const loginBody = await response.json();
    // delete the refresh token, current holding one still has valid issuer
    await pg`update refresh_tokens set revoked = true where user_id = ${userBody.user}`;

    request = generateRequest(refreshRoute, "POST", {
      refreshToken: loginBody.refreshToken,
    });

    const refreshResponse = await refresh(request);
    const refreshBody = await refreshResponse.json();

    expect(refreshResponse.status).toBe(401);
    expect(refreshBody.error).toBe("Revoked all sessions");
  });

  test("Successful refresh", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const user = await register(request);

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const response = await login(request);
    const loginBody = await response.json();

    request = generateRequest(refreshRoute, "POST", {
      refreshToken: loginBody.refreshToken,
    });

    const refreshResponse = await refresh(request);
    const refreshBody = await refreshResponse.json();

    expect(refreshResponse.status).toBe(200);
    expect(refreshBody.accessToken).not.toBe(null);
    expect(refreshBody.refreshToken).not.toBe(null);
    expect(refreshBody.tokenType).toBe("Bearer");
    expect(refreshBody.expiresIn).toBe(600);

    const test = await pg`select * from refresh_tokens`;
    expect(test.length).toBe(2);

    const tokenPayload = await verifyRefreshToken(refreshBody.refreshToken);
    const newTokenHash = createHash("sha256")
      .update(tokenPayload.jwt_id)
      .digest("hex");

    for (const refresh of test) {
      if (refresh.token_hash === newTokenHash) {
        expect(refresh.revoked).toBe(false);
      } else {
        expect(refresh.revoked).toBe(true);
      }
    }
  });
});

describe("Forgot password test", () => {
  beforeEach(async () => {
    await redis.send("FLUSHDB", []);
    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
  });

  test("Email is not provided", async () => {
    let request = generateRequest(
      "http://localhost/auth/reset-password",
      "POST",
      {
        not_email: "Aklwdhakd",
      },
    );

    const response = await forgotPassword(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Email not provided");
  });

  test("Email doesn't exist", async () => {
    let request = generateRequest(
      "http://localhost/auth/reset-password",
      "POST",
      {
        email: "Aklwdhakd",
      },
    );

    const response = await forgotPassword(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("User does not exist");
  });
});

describe("Reset password tests", () => {
  const resetPasswordRoute = "http://localhost/auth/reset-password";
  afterEach(async () => {
    await redis.send("FLUSHDB", []);
    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
  });

  test("No token passed in", async () => {
    let request = generateRequest(resetPasswordRoute, "POST", {
      email: "dawdaaad",
      password: "dadanaad",
    });

    const response = await resetPassword(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing token or password");
  });

  test("No email passed in", async () => {
    let request = generateRequest(resetPasswordRoute, "POST", {
      token: "dawdaaad",
      password: "dadanaad",
    });

    const response = await resetPassword(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing token or password");
  });

  test("No password passed in", async () => {
    let request = generateRequest(resetPasswordRoute, "POST", {
      email: "dawdaaad",
      token: "dadanaad",
    });

    const response = await resetPassword(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing token or password");
  });

  test("Invalid password", async () => {
    let request = generateRequest(resetPasswordRoute, "POST", {
      email: "dawknda",
      token: "dakwhdawkda",
      password: "bob",
    });

    const response = await resetPassword(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid password");
  });

  test("Invalid token", async () => {
    let request = generateRequest(resetPasswordRoute, "POST", {
      email: "dawknda",
      token: "dakwhdawkda",
      password: "bobadklnwdaklj1231",
    });

    const response = await resetPassword(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Token expired or is invalid");
  });

  test("Successful reset", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "jasonli3960@gmail.com",
      username: "test",
      password: "password123",
    });

    await register(request);
    const testingEmail = "jasonli3960@gmail.com";

    request = generateRequest("http://localhost/auth/reset-password", "POST", {
      email: "jasonli3960@gmail.com",
    });

    const response = await forgotPassword(request);
    await response.json();

    let getToken = await redis.get(`resetPassword:jasonli3960@gmail.com`);

    request = generateRequest("http://localhost/auth/reset-password", "POST", {
      email: "jasonli3960@gmail.com",
      token: getToken,
      password: "newpassword1234",
    });

    const query_1 =
      await pg`select password_hash from users where email = ${testingEmail}`;
    const resetResponse = await resetPassword(request);
    const resetBody = await resetResponse.json();

    expect(resetResponse.status).toBe(200);
    expect(resetBody.message).toBe("Password successfully updated");

    getToken = await redis.get(`resetPassword:jasonli3960@gmail.com`);

    expect(getToken).toBe(null);

    const query_2 =
      await pg`select password_hash from users where email = ${testingEmail}`;

    expect(query_1[0].password_hash).not.toBe(query_2[0].password_hash);
  });
});

describe("Logout tests", () => {
  const logoutRoute = "http://localhost/auth/logout";

  test("User successfully logged out", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const userResponse = await register(request);
    const userBody = await userResponse.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const loginResponse = await login(request);
    const loginBody = await loginResponse.json();

    request = generateAuthenticatedRequest(
      logoutRoute,
      "POST",
      {
        refreshToken: loginBody.refreshToken,
      },
      loginBody.accessToken,
    );

    const logoutResponse = await logout(request);
    const logoutBody = await logoutResponse.json();

    expect(logoutResponse.status).toBe(200);
    expect(logoutBody.message).toBe("User has been logged out");

    const findToken =
      await pg`select * from refresh_tokens where user_id = ${userBody.user}`;

    expect(findToken[0].revoked).toBe(true);
  });

  test("User doesn't get logged out, success still returned", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    await register(request);

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const loginResponse = await login(request);
    const loginBody = await loginResponse.json();

    request = generateAuthenticatedRequest(
      logoutRoute,
      "POST",
      {
        refreshToken: "dhbawkjdabdababdjwbd",
      },
      loginBody.accessToken,
    );

    const logoutResponse = await logout(request);
    const logoutBody = await logoutResponse.json();

    expect(logoutResponse.status).toBe(200);
    expect(logoutBody.message).toBe("User has been logged out");
  });
});

describe("Logout-all tests", () => {
  test("User is not authorised to logout", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const userResponse = await register(request);
    await userResponse.json();

    request = generateAuthenticatedRequest(
      logoutAllRoute,
      "POST",
      {
        test: "dawjdakd",
      },
      "dajwhdajkdad",
    );

    const logoutAllResponse = await logoutAll(request);
    const logoutAllResponseBody = await logoutAllResponse.json();

    expect(logoutAllResponse.status).toBe(401);
    expect(logoutAllResponseBody.error).toBe("Invalid or expired token");
  });

  test("All sessions logged out", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });

    const registerResponse = await register(request);
    const registerBody = await registerResponse.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const loginResponse = await login(request);
    const loginBody = await loginResponse.json();

    request = generateRequest(loginRoute, "POST", {
      email: "testing@gmail.com",
      password: "password123",
    });

    const loginResponse2 = await login(request);
    await loginResponse2.json();

    request = generateAuthenticatedRequest(
      logoutAllRoute,
      "POST",
      {
        refreshToken: loginBody.refreshToken,
      },
      loginBody.accessToken,
    );

    const logoutAllResponse = await logoutAll(request);
    const logoutAllResponseBody = await logoutAllResponse.json();

    expect(logoutAllResponse.status).toBe(200);
    expect(logoutAllResponseBody.message).toBe("All sessions logged out");

    const email = registerBody.user;
    const findTokens =
      await pg`select * from refresh_tokens where user_id = ${email}`;
    expect(findTokens.length).toBe(2);

    for (const refresh of findTokens) {
      expect(refresh.revoked).toBe(true);
    }
  });
});

describe("GET /users/:userId/purchases", () => {
  test("returns 200 and empty orders when user has no purchases", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "buyer@test.com",
      username: "buyer",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "buyer@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessToken = loginBody.accessToken;

    const req = generateAuthenticatedRequest(
      `/users/${userId}/purchases`,
      "GET",
      undefined,
      accessToken,
    );
    const response = await getUserPurchases(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ orders: [] });
  });

  test("returns 200 and list of orders when user has purchases", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "buyer@test.com",
      username: "buyer",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "buyer@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessToken = loginBody.accessToken;

    const seller = await insertUser();
    await insertOrder({ buyer_id: userId, seller_id: seller.user_id });
    await insertOrder({ buyer_id: userId, seller_id: seller.user_id });

    const req = generateAuthenticatedRequest(
      `/users/${userId}/purchases`,
      "GET",
      undefined,
      accessToken,
    );
    const response = await getUserPurchases(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toBeDefined();
    expect(body.orders.length).toBe(2);
  });

  test("returns 401 when Authorization header is missing", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "buyer@test.com",
      username: "buyer",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const req = generateRequest(`/users/${userId}/purchases`, "GET", undefined);
    const response = await getUserPurchases(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 401 when token is for a different user than path", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "userA@test.com",
      username: "userA",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    await registerResponse.json();
    expect(registerResponse.status).toBe(201);

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "userA@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessTokenA = loginBody.accessToken;

    const registerReqB = generateRequest(registerRoute, "POST", {
      email: "userB@test.com",
      username: "userB",
      password: "password123",
    });
    const registerResponseB = await register(registerReqB);
    const registerBodyB = await registerResponseB.json();
    expect(registerResponseB.status).toBe(201);
    const userIdB = registerBodyB.user;

    const req = generateAuthenticatedRequest(
      `/users/${userIdB}/purchases`,
      "GET",
      undefined,
      accessTokenA,
    );
    const response = await getUserPurchases(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 404 when path user does not exist", async () => {
    const nonExistentUserId = crypto.randomUUID();
    const token = await createAccessToken(
      nonExistentUserId,
      "nonexistent@test.com",
    );
    const req = generateAuthenticatedRequest(
      `/users/${nonExistentUserId}/purchases`,
      "GET",
      undefined,
      token,
    );
    const response = await getUserPurchases(req);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body?.error).toBe("User not found!");
  });
});

describe("GET /users/:userId/sales", () => {
  test("returns 200 and empty orders when user has no sales", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "seller@test.com",
      username: "seller",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "seller@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessToken = loginBody.accessToken;

    const req = generateAuthenticatedRequest(
      `/users/${userId}/sales`,
      "GET",
      undefined,
      accessToken,
    );
    const response = await getUserSales(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ orders: [] });
  });

  test("returns 200 and list of orders when user has sales", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "seller@test.com",
      username: "seller",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "seller@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessToken = loginBody.accessToken;

    const buyer = await insertUser();
    await insertOrder({ buyer_id: buyer.user_id, seller_id: userId });
    await insertOrder({ buyer_id: buyer.user_id, seller_id: userId });

    const req = generateAuthenticatedRequest(
      `/users/${userId}/sales`,
      "GET",
      undefined,
      accessToken,
    );
    const response = await getUserSales(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders).toBeDefined();
    expect(body.orders.length).toBe(2);
  });

  test("returns 401 when Authorization header is missing", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "seller@test.com",
      username: "seller",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    const req = generateRequest(`/users/${userId}/sales`, "GET", undefined);
    const response = await getUserSales(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 401 when token is for a different user than path", async () => {
    const registerReq = generateRequest(registerRoute, "POST", {
      email: "userA@test.com",
      username: "userA",
      password: "password123",
    });
    const registerResponse = await register(registerReq);
    expect(registerResponse.status).toBe(201);

    const loginReq = generateRequest(loginRoute, "POST", {
      email: "userA@test.com",
      password: "password123",
    });
    const loginResponse = await login(loginReq);
    const loginBody = await loginResponse.json();
    expect(loginResponse.status).toBe(200);
    const accessTokenA = loginBody.accessToken;

    const registerReqB = generateRequest(registerRoute, "POST", {
      email: "userB@test.com",
      username: "userB",
      password: "password123",
    });
    const registerResponseB = await register(registerReqB);
    const registerBodyB = await registerResponseB.json();
    expect(registerResponseB.status).toBe(201);
    const userIdB = registerBodyB.user;

    const req = generateAuthenticatedRequest(
      `/users/${userIdB}/sales`,
      "GET",
      undefined,
      accessTokenA,
    );
    const response = await getUserSales(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 404 when path user does not exist", async () => {
    const nonExistentUserId = crypto.randomUUID();
    const token = await createAccessToken(
      nonExistentUserId,
      "nonexistent@test.com",
    );
    const req = generateAuthenticatedRequest(
      `/users/${nonExistentUserId}/sales`,
      "GET",
      undefined,
      token,
    );
    const response = await getUserSales(req);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body?.error).toBe("User not found!");
  });
});
