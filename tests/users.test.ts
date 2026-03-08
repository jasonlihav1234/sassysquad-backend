import { expect, test, describe } from "bun:test";
import {
  generateUser,
  checkUser,
  register,
  login,
  refresh,
} from "../src/application/user_application";
import { handleRequest } from "../src/routes";

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
    expect(message === "Invalid credentials");
  });

  test("Email not provided", async () => {
    const request = generateRequest(loginRoute, "POST", {
      password: "testdahdjaw",
    });

    const response = await login(request);
    const message = await response.json();
    expect(response.status === 400);
    expect(message === "Email and password required");
  });

  test("Password not provided", async () => {
    const request = generateRequest(loginRoute, "POST", {
      email: "testdahdjaw",
    });

    const response = await login(request);
    const message = await response.json();
    expect(response.status).toBe(400);
    expect(message).toBe("Email and password required");
  });
});
