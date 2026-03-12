import {
  config,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt_config";
import { type JWTPayload } from "jose";
import bcrypt from "bcrypt";
import pg, { redis } from "../utils/db";
import {
  jsonHelper,
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshTokenSession,
  revokeRefreshToken,
  getAuthenticatedUserId,
  authHelper,
  AuthReq,
  revokeAllUserRefreshTokens,
} from "../utils/jwt_helpers";
import nodemailer from "nodemailer";
import path from "path";
import {
  getUserBuyerOrders,
  getUserSellerOrders,
  isUserIdValid,
} from "../database/queries/user_queries";
import { json } from "stream/consumers";

export interface TokenPayload extends JWTPayload {
  subject_claim: string;
  email: string;
  type: "access" | "refresh";
  jwt_id: string;
}

export interface UserDetails {
  email: string;
  password: string;
  username: string;
  id: string;
  createdAt: Date;
}

// converts secret strings to int8Array for jose library
const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.refreshSecret);

const SALT_ROUNDS = 10;

export async function generateUser(
  email: string,
  username: string,
  password: string
): Promise<UserDetails> {
  const query = await pg`select * from users where email = ${email}`;

  if (query.length > 0) {
    throw new Error("User already exists");
  }

  const hashPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser: UserDetails = {
    email: email,
    username: username,
    password: hashPassword,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  await pg`insert into users (user_id, user_name, email, password_hash, created_at) 
            values (${newUser.id}, ${username}, ${newUser.email}, ${
    newUser.password
  }, ${newUser.createdAt.toISOString()})`;

  return newUser;
}

// checks if password is correct
export async function checkUser(
  email: string,
  password: string
): Promise<UserDetails | null> {
  const query = await pg`select * from users where email = ${email}`;

  if (query.length === 0) {
    // doing fake hash to make it slower on fails, prevents attackers from checking which accounts don't exist
    await bcrypt.hash(password, SALT_ROUNDS);

    return null;
  }

  const user = query[0];
  // need to change this for how it is returned in a table
  const checkPassword = await bcrypt.compare(password, user.password_hash);

  if (!checkPassword) {
    return null;
  }

  return {
    email: user.email,
    password: user.password,
    username: user.username,
    id: user.user_id,
    createdAt: user.created_at,
  };
}

// expecting email and password passed in
export async function register(request: Request) {
  try {
    const body = await request.json();
    const email = body.email;
    const password = body.password;
    const username = body.username;

    if (!email || !password || !username) {
      return jsonHelper(
        { error: "Email, password, and username required" },
        400
      );
    }

    if (password.length < 7) {
      return jsonHelper(
        { error: "Password must be at least 7 characters long" },
        400
      );
    }

    const user = await generateUser(email, username, password);

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
      expiresIn: 600,
    });
  } catch (error) {
    console.log(error);
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
      verifiedRefreshToken.jwt_id as string
    );

    if (!storedRefreshToken) {
      return jsonHelper({ error: "Refresh token does not exist" }, 401);
    }

    if (storedRefreshToken.revoked) {
      // revoke entire token faily to force re-authentication, may be stolen
      revokeRefreshTokenSession(storedRefreshToken.session_id);
      return jsonHelper({ error: "Revoked all sessions" }, 401);
    }

    // revoke old token
    revokeRefreshToken(verifiedRefreshToken.jwt_id as string);

    // generate new pair
    const newAccessToken = await createAccessToken(
      verifiedRefreshToken.subject_claim,
      verifiedRefreshToken.email
    );

    const newRefreshToken = await createRefreshToken(
      verifiedRefreshToken.subject_claim,
      verifiedRefreshToken.email
    );
    await storeRefreshToken(
      verifiedRefreshToken.subject_claim,
      storedRefreshToken.session_id,
      storedRefreshToken.device_info,
      newRefreshToken.tokenId
    );

    return jsonHelper({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken.token,
      tokenType: "Bearer",
      expiresIn: 600,
    });
  } catch (error) {
    return jsonHelper(
      {
        error: "Refresh token is invalid",
      },
      401
    );
  }
}

export const logout = authHelper(
  async (request: AuthReq): Promise<Response> => {
    try {
      const body = await request.json();
      const refreshToken = body.refreshToken;

      if (refreshToken) {
        const token = await verifyRefreshToken(refreshToken);
        await revokeRefreshToken(token.jwt_id as string);
      }

      return jsonHelper({ message: "User has been logged out" });
    } catch (error) {
      // we return the same message here to prevent attackers from knowing which tokens are valid
      return jsonHelper({ message: "User has been logged out" });
    }
  }
);

export const logoutAll = authHelper(async (req: AuthReq): Promise<Response> => {
  await revokeAllUserRefreshTokens(req.user!.subject_claim);

  return jsonHelper({ message: "All sessions logged out" });
});
export async function forgotPassword(request: Request) {
  const body = await request.json();

  if (!body.email) {
    return jsonHelper(
      {
        error: "Email not provided",
      },
      400
    );
  }

  // verify that email is valid, and that the email exists in the database
  const recipentEmail = body.email;
  const checkEmail =
    await pg`select * from users where email = ${recipentEmail}`;

  if (checkEmail.length === 0) {
    return jsonHelper(
      {
        error: "User does not exist",
      },
      404
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "jasonli3960@gmail.com",
      pass: process.env.GOOGLE_APP_PASSWORD,
    },
  });
  const imagePath = path.join(
    import.meta.dirname,
    "../utils/pictures/office_pic.jpg"
  );

  const resetPasswordToken = crypto.randomUUID();
  const key = `resetPassword:${recipentEmail}`;

  // conflicting keys
  await redis.set(key, resetPasswordToken);
  await redis.expire(key, 600); // reset password token lasts 30 minutes

  const mailData = {
    from: '"SaasySquad" <jasonli3960@gmail.com>',
    to: `${recipentEmail}`,
    subject: "Password Reset - SaasySquad",
    html: `
<div style="background-color: #f0f4f8; padding: 40px 0; font-family: Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ddd;">
      
        <div style="padding: 30px 40px 10px 40px;">
          <h1 style="font-size: 35px; font-weight: bold; color: #000; margin: 0;">Your password reset</h1>
        </div>

        <div style="padding: 25px 0;">
          <img src="cid:office_pic" alt="Office Speaking Tings" style="width: 100%; display: block;">
        </div>

        <div style="padding: 20px 40px; color: #333; line-height: 1.6; font-size: 14px;">
          <p>We received a request to <span style="background-color: #ffeeba;">reset</span> the <span style="background-color: #ffeeba;">password</span> associated with this email address.</p>
          <p>If you made this request, please follow the instructions below.</p>

          <p style="margin-top: 25px;">Click the link below to go to the last step to <span style="background-color: #ffeeba;">reset</span> your <span style="background-color: #ffeeba;">password</span>: (need frontend for this part)</p>
          <p>Testing reset password token: ${resetPasswordToken}</p>

          <p>If you did not request to have your <span style="background-color: #ffeeba;">password</span> <span style="background-color: #ffeeba;">reset</span> you can safely ignore this email. Be assured your account is safe.</p>
        </div>
      </div>
    </div>
    `,
    attachments: [
      {
        filename: "office_pic.jpg",
        path: imagePath,
        cid: "office_pic",
      },
    ],
  };

  try {
    await transporter.sendMail(mailData);

    return jsonHelper({ message: "Mail successfully sent" });
  } catch (error) {
    return jsonHelper({ error: "Mail failed to send" }, 500);
  }
}

export async function resetPassword(request: Request) {
  const body = await request.json();
  const email = body.email;
  const token = body.token;
  const password = body.password;

  if (!token || !password || !email) {
    return jsonHelper({ error: "Missing token or password" }, 400);
  }

  // check password is valid
  if (password.length < 7) {
    return jsonHelper({ error: "Invalid password" }, 401);
  }

  // check token is valid;
  const resetPasswordToken = await redis.get(`resetPassword:${email}`);

  if (!resetPasswordToken || resetPasswordToken != token) {
    return jsonHelper(
      {
        error: "Token expired or is invalid",
      },
      404
    );
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // change the password
  await pg`
  update users
  set password_hash = ${passwordHash}
  where email = ${email}
  `;

  await redis.del(`resetPassword:${email}`);

  return jsonHelper({
    message: "Password successfully updated",
  });
}

// For GET users/{userId}/purchases

export async function getUserPurchases(req: any, res: any) {
  // Example: /users/abc-123/purchases?page=1&limit=10
  const pathname = req.url?.split("?")[0] ?? "";
  const components = pathname.split("/").filter(Boolean);

  if (
    components.length !== 3 ||
    components[0] !== "users" ||
    components[2] !== "purchases"
  ) {
    return res.status(400).json({ error: "Invalid purchases route path!" });
  }

  const pathUserId = components[1];
  // Helper in jwt_helpers
  const tokenUserId = await getAuthenticatedUserId(req, res, pathUserId);
  if (tokenUserId === null) return;

  const userRows = await isUserIdValid(pathUserId);
  if (!userRows) {
    return res.status(404).json({ error: "User not found!" });
  }

  const accept =
    req.headers?.accept || req.headers?.Accept || "application/json";
  const wantsJson =
    String(accept).includes("application/json") || String(accept) === "*/*";
  const wantsXml =
    String(accept).includes("application/xml") ||
    String(accept).includes("text/xml");
  if (!wantsJson && !wantsXml) {
    return res.status(406).json({ error: "Unsupported formatting type" });
  }

  try {
    const orders = await getUserBuyerOrders(tokenUserId);
    res.status(200).json({ orders });
  } catch {
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}

// For GET users/{userId}/sales

export async function getUserSales(req: any, res: any) {
  const pathname = req.url?.split("?")[0] ?? "";
  const components = pathname.split("/").filter(Boolean);

  // Defensive check if application function is called from elsewhere in code 
  // other than route handler
  if (
    components.length !== 3 ||
    components[0] !== "users" ||
    components[2] !== "sales"
  ) {
    return res.status(400).json({ error: "Invalid sales route path!" });
  }

  const pathUserId = components[1];
  const tokenUserId = await getAuthenticatedUserId(req, res, pathUserId);
  if (tokenUserId === null) return;

  const userRows = await isUserIdValid(pathUserId);
  if (!userRows) {
    return res.status(404).json({ error: "User not found!" });
  }

  const accept =
    req.headers?.accept || req.headers?.Accept || "application/json";
  const wantsJson =
    String(accept).includes("application/json") || String(accept) === "*/*";
  const wantsXml =
    String(accept).includes("application/xml") ||
    String(accept).includes("text/xml");
  if (!wantsJson && !wantsXml) {
    return res.status(406).json({ error: "Unsupported formatting type" });
  }

  try {
    const orders = await getUserSellerOrders(tokenUserId);
    res.status(200).json({ orders });
  } catch {
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}
