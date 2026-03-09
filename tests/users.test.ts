import { expect, test, describe, spyOn } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  login,
  refresh,
  forgotPassword,
  resetPassword,
} from "../src/application/user_application";
import { afterEach, beforeEach, mock } from "node:test";
import pg, { redis } from "../src/utils/db";
import { createHash } from "node:crypto";
import { verifyRefreshToken } from "../src/utils/jwt_config";
import { sleep } from "bun";

const generateRequest = (
  url: string,
  givenMethod: string,
  givenBody: any,
): Request => {
  return new Request(`${url}`, {
    method: givenMethod,
    body: JSON.stringify(givenBody),
  });
};

const registerRoute = "http://localhost/auth/register";

describe("Register User", () => {
  const registerRoute = "http://localhost/auth/register";

  afterEach(async () => {
    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
  });

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

    // 1. SETUP: Ensure a clean slate first (await this!)
    await pg`delete from users where email = ${email}`;

    // 2. SEED: Create the user so they "already exist"
    // (Assuming your generateUser function takes these arguments)
    await generateUser(email, "test", "password123");

    // 3. ACT: Try to register the same user again
    const request = generateRequest(registerRoute, "POST", {
      email: email,
      username: "test",
      password: "password123",
    });

    const response = await register(request);
    const message = await response.json();

    // 4. ASSERT: Check for 409 Conflict
    expect(response.status).toBe(409);
    expect(message.error).toBe("User with this email already exists");

    // 5. CLEANUP: Remove the user after the test
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

  afterEach(async () => {
    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
  });

  test("User does not exist", async () => {
    const request = new Request(loginRoute, {
      method: "POST",
      body: JSON.stringify({
        email: "testing@gmail.com",
        password: "abc1234",
      }),
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

  afterEach(async () => {
    await pg`truncate table users restart identity cascade`;
    await pg`truncate table refresh_tokens restart identity cascade`;
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

  test("Email gets sent", async () => {
    let request = generateRequest(registerRoute, "POST", {
      email: "jasonli3960@gmail.com",
      username: "test",
      password: "password123",
    });

    await register(request);

    request = generateRequest("http://localhost/auth/reset-password", "POST", {
      email: "jasonli3960@gmail.com",
    });

    const response = await forgotPassword(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Mail successfully sent");

    let getToken = null;
    for (let i = 0; i < 20; i++) {
      getToken = await redis.get(`resetPassword:jasonli3960@gmail.com`);
      if (getToken) break; // Found it! Exit loop.
      await sleep(100);
    }

    expect(getToken).not.toBe(undefined);
    expect(getToken).not.toBe(null);
  });
});

describe("Reset password tests", () => {
  const resetPasswordRoute = "http://localhost/reset-password";
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
