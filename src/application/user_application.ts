import {
  config,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt_config";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcrypt";
import pg from "../utils/db";
import {
  jsonHelper,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshTokenSession,
} from "../utils/jwt_helpers";

export interface TokenPayload extends JWTPayload {
  subject_claim: string;
  email: string;
  type: "access" | "refresh";
  jwt_id: string;
}

export interface UserDetails {
  email: string;
  password: string;
  id: string;
  createdAt: Date;
}

// converts secret strings to Uint8Array for jose library
const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.refreshSecret);

const SALT_ROUNDS = 10;

export async function generateUser(
  email: string,
  password: string,
): Promise<UserDetails> {
  const query = await pg`select * from users where email = ${email}`;

  if (query.length > 0) {
    throw new Error("User already exists");
  }

  const hashPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser: UserDetails = {
    email: email,
    password: hashPassword,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  await pg`insert into users (user_id, email, password, created_at) 
            values (${newUser.id}, ${newUser.email}, ${newUser.password}, ${newUser.createdAt})`;

  return newUser;
}

// checks if password is correct
export async function checkUser(
  email: string,
  password: string,
): Promise<UserDetails | null> {
  const query = await pg`select * from users where email = ${email}`;

  if (query.length === 0) {
    // doing fake hash to make it slower on fails, prevents attackers from checking which accounts don't exist
    await bcrypt.hash(password, SALT_ROUNDS);

    return null;
  }

  const user = query[0];
  // need to change this for how it is returned in a table
  const checkPassword = await bcrypt.compare(password, user.passwordHash);

  if (!checkPassword) {
    return null;
  }

  return user;
}

// expecting email and password passed in
export async function register(request: Request) {
  try {
    const body = await request.json();
    const email = body.email;
    const password = body.password;

    if (!email || !password) {
      return jsonHelper({ error: "Email and password required" }, 400);
    }

    if (password.length < 7) {
      return jsonHelper(
        { error: "Password must be at least 7 characters long" },
        400,
      );
    }

    const user = await generateUser(email, password);

    return jsonHelper({ message: "User has been created", user: user.id }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "User already exists") {
      return jsonHelper({ error: "User with this email already exists" }, 409);
    }

    return jsonHelper({ error: "Error occurred during registration" }, 500);
  }
}

export async function login(request: Request) {
  try {
    const body = await request.json();
    const email = body.email;
    const password = body.password;

    if (!email || !password) {
      return jsonHelper({ error: "Email and password required" }, 400);
    }

    const user = await checkUser(email, password);

    if (user === null) {
      // user enumeration
      return jsonHelper({ error: "Invalid credentials" }, 401);
    }

    const accessToken = await createAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id, user.email);
    const sessionId = crypto.randomUUID();
    const device = request.headers.get("User-Agent") || "null";

    await storeRefreshToken(user.id, sessionId, device, refreshToken.tokenId);
    // setting expiration to 10 minutes = 600 seconds
    return jsonHelper({
      accessToken: accessToken,
      refreshToken: refreshToken.token,
      tokenType: "Bearer",
      expiresin: 600,
    });
  } catch (error) {
    return jsonHelper({ error: "Login failed" }, 500);
  }
}

export async function refresh(request: Request) {
  try {
    const body = await request.json();
    const refreshToken = body.refreshToken;
    const newTokenId = crypto.randomUUID();

    if (!refreshToken) {
      return jsonHelper({ error: "Refresh token required" }, 400);
    }

    const verifiedRefreshToken = await verifyRefreshToken(refreshToken);
    const storedRefreshToken = await getRefreshToken(
      verifiedRefreshToken.jwt_id as string,
    );

    if (!storedRefreshToken) {
      return jsonHelper({ error: "Refresh token does not exist" }, 401);
    }

    if (storedRefreshToken.revoked) {
      // revoke entire token faily to force re-authentication, may be stolen
      revokeRefreshTokenSession(storedRefreshToken.sessionId);
      return jsonHelper({ error: "Revoked all sessions" }, 401);
    }

    // revoke old token
    // revokeRefreshToken(verifiedRefreshToken.jwt_id as string);

    // generate new pair
    const newAccessToken = await createAccessToken(
      verifiedRefreshToken.subject_claim,
      verifiedRefreshToken.email,
    );

    const newRefreshToken = await createRefreshToken(
      verifiedRefreshToken.subject_claim,
      verifiedRefreshToken.email,
    );

    await storeRefreshToken(
      verifiedRefreshToken.subject_claim,
      storedRefreshToken.sessionId,
      storedRefreshToken.deviceInfo,
      newTokenId,
    );

    return jsonHelper({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: 600,
    });
  } catch (error) {
    return jsonHelper(
      {
        error: "Refresh token is invalid",
      },
      401,
    );
  }
}
