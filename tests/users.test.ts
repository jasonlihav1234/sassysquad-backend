import { expect, test, describe, spyOn } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  login,
  refresh,
} from "../src/application/user_application";
import { handleRequest } from "../src/routes";
import { beforeEach, mock } from "node:test";
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

describe("Register User", () => {
  const registerRoute = "http://localhost/auth/register";

  test("Email not provided", async () => {
    const request = generateRequest(registerRoute, "POST", {
      password: "akwdhadw",
    });

    const response = await register(request);
    const message = await response.json();

    expect(response.status).toBe(400);
    expect(message.error).toBe("Email, password, and username required");
  });

  test("Password not provided", async () => {
    const request = generateRequest(registerRoute, "POST", {
      email: "tesing@gmail.com",
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
    try {
      await generateUser("testing@gmail.com", "test", "password123");
    } catch (error) {
      pg`delete from users where email = testing@gmail.com`;
    }

    const request = generateRequest(registerRoute, "POST", {
      email: "testing@gmail.com",
      username: "test",
      password: "password123",
    });
    const response = await register(request);
    pg`delete from users where email = testing@gmail.com`;

    const message = await response.json();
    expect(response.status).toBe(409);
    expect(message.error).toBe("User with this email already exists");
  });
});

describe("Login User", () => {
  const loginRoute = "http://localhost/auth/login";

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
});
