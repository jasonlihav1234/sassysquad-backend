import {
  expect,
  test,
  describe,
  spyOn,
  beforeAll,
  afterAll,
  mock,
} from "bun:test";
import {
  generateUser,
  register,
  refresh,
  login,
  logout,
  logoutAll,
  forgotPasswordV1,
  resetPassword,
  getUserPurchases,
  getUserSales,
  getMyProfileDetails,
  getUserDetailsById,
  updateProfile,
  deleteUser,
  getUserSessions,
} from "../../src/application/user_application";
import { afterEach, beforeEach } from "node:test";
import pg, { redis } from "../../src/utils/db";
import { createHash } from "node:crypto";
import {
  verifyRefreshToken,
  createAccessToken,
} from "../../src/utils/jwt_config";
import * as authUtils from "../../src/utils/jwt_config";
import {
  generateRequest,
  generateAuthenticatedRequest,
  insertUser,
  insertOrder,
  resetDb,
  registerAndLogin,
  registerOnly,
} from "../test_helper";
import { getAuthenticatedUserId } from "../../src/utils/jwt_helpers";

const registerRoute = "http://localhost/auth/register";
const logoutRoute = "http://localhost/auth/logout";
const refreshRoute = "http://localhost/auth/refresh";
const loginRoute = "http://localhost/auth/login";
const logoutAllRoute = "http://localhost/auth/logout-all";

describe("Register User", () => {
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
  beforeEach(async () => {
    await resetDb();
  });

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
  beforeEach(async () => {
    await resetDb();
  });

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
  test("Email is not provided", async () => {
    let request = generateRequest(
      "http://localhost/auth/reset-password",
      "POST",
      {
        not_email: "Aklwdhakd",
      },
    );

    const response = await forgotPasswordV1(request);
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

    const response = await forgotPasswordV1(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("User does not exist");
  });
});

describe("Reset password tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const resetPasswordRoute = "http://localhost/auth/reset-password";

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

    const response = await forgotPasswordV1(request);
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
  beforeEach(async () => {
    await resetDb();
  });

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
  beforeEach(async () => {
    await resetDb();
  });

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
    const uniqueEmail = `logout-all-${crypto.randomUUID()}@test.com`;
    let request = generateRequest(registerRoute, "POST", {
      email: uniqueEmail,
      username: "test",
      password: "password123",
    });

    const registerResponse = await register(request);
    const registerBody = await registerResponse.json();
    expect(registerResponse.status).toBe(201);
    const userId = registerBody.user;

    request = generateRequest(loginRoute, "POST", {
      email: uniqueEmail,
      password: "password123",
    });

    const loginResponse = await login(request);
    const loginBody = await loginResponse.json();

    request = generateRequest(loginRoute, "POST", {
      email: uniqueEmail,
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

    const findTokens =
      await pg`select * from refresh_tokens where user_id = ${userId}`;
    expect(findTokens.length).toBe(2);

    for (const refresh of findTokens) {
      expect(refresh.revoked).toBe(true);
    }
  });
});

describe("GET /users/:userId/purchases", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("returns 200 and empty orders when user has no purchases", async () => {
    const { userId, accessToken } = await registerAndLogin(
      "buyer@test.com",
      "buyer",
      "password123",
    );

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
    const { userId, accessToken } = await registerAndLogin(
      "buyer@test.com",
      "buyer",
      "password123",
    );

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
    const { userId } = await registerOnly(
      "buyer@test.com",
      "buyer",
      "password123",
    );

    const req = generateRequest(`/users/${userId}/purchases`, "GET", undefined);
    const response = await getUserPurchases(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 401 when token is for a different user than path", async () => {
    const { accessToken: accessTokenA } = await registerAndLogin(
      "userA@test.com",
      "userA",
      "password123",
    );
    const { userId: userIdB } = await registerOnly(
      "userB@test.com",
      "userB",
      "password123",
    );

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
  beforeEach(async () => {
    await resetDb();
  });

  test("returns 200 and empty orders when user has no sales", async () => {
    const { userId, accessToken } = await registerAndLogin(
      "seller@test.com",
      "seller",
      "password123",
    );

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
    const { userId, accessToken } = await registerAndLogin(
      "seller@test.com",
      "seller",
      "password123",
    );

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
    const { userId } = await registerOnly(
      "seller@test.com",
      "seller",
      "password123",
    );

    const req = generateRequest(`/users/${userId}/sales`, "GET", undefined);
    const response = await getUserSales(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body?.error).toBeDefined();
  });

  test("returns 401 when token is for a different user than path", async () => {
    const { accessToken: accessTokenA } = await registerAndLogin(
      "userA@test.com",
      "userA",
      "password123",
    );
    const { userId: userIdB } = await registerOnly(
      "userB@test.com",
      "userB",
      "password123",
    );

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

describe("Getting users profile test", () => {
  let accessToken: string = "";
  let userId: string = "";
  beforeAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );
    const regRes = await register(registerReq);
    const regBody = await regRes.json();
    userId = regBody.user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginRes = await login(loginReq);
    const body = await loginRes.json();

    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;
  });

  test("Successfully fetches profile", async () => {
    const authReq = generateAuthenticatedRequest(
      "/profile",
      "GET",
      {},
      accessToken,
    );
    const response = await getMyProfileDetails(authReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.response).not.toBe(undefined);
    expect(body.response[0].email).toBe("jasonli1234@gmail.com");
  });

  // kinda impossible to test 500 route since this means that authentication postgres crashed

  test("Successfully fetch a profile given a user ID", async () => {
    const authReq = generateAuthenticatedRequest(
      `/users/${userId}`,
      "GET",
      {},
      accessToken,
    );

    const response = await getUserDetailsById(authReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.response).not.toBe(undefined);
    expect(body.response[0].email).toBe("jasonli1234@gmail.com");
  });

  test("Fetching a profile for a user that doesn't exist", async () => {
    const authReq = generateAuthenticatedRequest(
      `/users/awiodhadwiaw`,
      "GET",
      {},
      accessToken,
    );

    const response = await getUserDetailsById(authReq);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Cannot get user details");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Updating profile tests", () => {
  let accessToken: string = "";
  let userId: string = "";
  beforeAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );
    const regRes = await register(registerReq);
    const regBody = await regRes.json();
    userId = regBody.user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginRes = await login(loginReq);
    const body = await loginRes.json();

    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;
  });

  test("No fields to update provided", async () => {
    const authReq = generateAuthenticatedRequest(
      `/profile`,
      "PATCH",
      {},
      accessToken,
    );

    const response = await updateProfile(authReq);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("No fields to update for the user");
  });

  test("Details get successfully updated", async () => {
    const authReq = generateAuthenticatedRequest(
      `/profile`,
      "PATCH",
      {
        username: "newusernam12345",
      },
      accessToken,
    );

    const response = await updateProfile(authReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Details successfully updated");
  });

  test("Username too long", async () => {
    const authReq = generateAuthenticatedRequest(
      `/profile`,
      "PATCH",
      {
        username:
          "mocbmlmdnjxrmabwdkajbndkajdwbjklbvkeghfamouvotvnkunpltyoiskwdeocqrrknbgvcnozkfholefrmhjamwnqdekmnunpodpcvuwqbdqpbntwanvvhglrggqdgppekoqmewfdxlqxhzjvidfbzvwpdvvvrahfvwthfdyquvfmpvcebwqjffychklevonvxivsnhjrqmynttnztumdfxhzycuxisledsejhqraysczxubzxnenocctgrlemdmusbwbvojmznhvfyyz",
      },
      accessToken,
    );

    const response = await updateProfile(authReq);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Profile failed to update");
  });
});

describe("Deleting a user test", () => {
  let accessToken: string = "";
  let userId: string = "";
  beforeAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );
    const regRes = await register(registerReq);
    const regBody = await regRes.json();
    userId = regBody.user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginRes = await login(loginReq);
    const body = await loginRes.json();

    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;
  });

  test("User successfully deleted", async () => {
    const authReq = generateAuthenticatedRequest(
      `/profile`,
      "DELETE",
      {},
      accessToken,
    );

    const response = await deleteUser(authReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("User successfully deleted");

    const query = await pg`select * from users where user_id = ${userId}`;
    expect(query.length).toBe(0);
  });

  // impossible to test the 500 path unless the postgres server crashes
});

describe("Getting user session tests", () => {
  let accessToken: string = "";
  let userId: string = "";
  beforeAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );
    const regRes = await register(registerReq);
    const regBody = await regRes.json();
    userId = regBody.user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginRes = await login(loginReq);
    const body = await loginRes.json();

    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await pg`delete from users`;
    await pg`delete from refresh_tokens`;
  });

  test("Successfully getting the sessions", async () => {
    const authReq = generateAuthenticatedRequest(
      `/auth/sessions`,
      "GET",
      {},
      accessToken,
    );

    const response = await getUserSessions(authReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).not.toBe(undefined);
    expect(body.session[0].createdAt).not.toBe(undefined);
    expect(body.session[0].expiresAt).not.toBe(undefined);
  });
});

describe("Getting authenticated userId tests", () => {
  const createMockRes = () => {
    const res = {
      status: function () {
        return this;
      },
      json: function () {
        return this;
      },
    };
    spyOn(res, "status");
    spyOn(res, "json");
    return res as any;
  };

  afterEach(() => {
    mock.restore();
  });

  test("Invalid authorization method", async () => {
    const res = createMockRes();
    const request = {
      url: "test/route",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `fake auth`,
      },
      body: {},
      json: async () => {},
    };

    const response = await getAuthenticatedUserId(request, res);

    expect(response).toBe(null);
  });

  test("returns tokenUserId when succeeds, no pathId given", async () => {
    const req = { headers: { authorization: "Bearer valid.fake.token" } };
    const res = createMockRes();

    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);

    const result = await getAuthenticatedUserId(req, res);

    expect(result).toBe("user_123");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test("returns tokenUserId when succeeds, matches pathId", async () => {
    const req = { headers: { authorization: "Bearer valid.fake.token" } };
    const res = createMockRes();

    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);

    const result = await getAuthenticatedUserId(req, res, "user_123");

    expect(result).toBe("user_123");
    expect(res.status).not.toHaveBeenCalled();
  });

  test("returns null and 401 when verifyAccessToken throws an error", async () => {
    const req = { headers: { authorization: "Bearer bad.fake.token" } };
    const res = createMockRes();

    spyOn(authUtils, "verifyAccessToken").mockRejectedValue(
      new Error("JWT Expired"),
    );

    const result = await getAuthenticatedUserId(req, res);

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "User is not logged on or lacks authorization to access orders",
    });
  });

  test("returns null and 401 when tokenUserId doesn't match pathUserId", async () => {
    const req = { headers: { authorization: "Bearer valid.fake.token" } };
    const res = createMockRes();

    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);

    const result = await getAuthenticatedUserId(req, res, "user_999");

    expect(result).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "User is not logged on or lacks authorization to access orders",
    });
  });
});
