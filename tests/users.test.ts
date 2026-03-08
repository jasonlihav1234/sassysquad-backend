import { expect, test, describe, spyOn } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  login,
  refresh,
} from "../src/application/user_application";
import { handleRequest } from "../src/routes";
import { afterEach, beforeEach, mock } from "node:test";
import { devNull } from "node:os";
import pg from "../src/utils/db";

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
