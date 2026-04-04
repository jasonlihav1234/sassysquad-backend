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
  authHelper,
  AuthReq,
  revokeAllUserRefreshTokens,
  getAllUserRefreshTokens,
  createSessionTokens,
} from "../utils/jwt_helpers";
import nodemailer from "nodemailer";
import path from "path";
import {
  getUserBuyerOrders,
  getUserById,
  getUserSellerOrders,
  isUserIdValid,
  removeUserById,
  updateProfileQuery,
} from "../database/queries/user_queries";
import { VercelRequest, VercelResponse } from "@vercel/node";
import * as arctic from "arctic";
import { generateSecret, verify, generateURI } from "otplib";
import qrcode from "qrcode";

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

const SALT_ROUNDS = 10;
const FRONTEND_URL = "https://saasysquad-frontend.vercel.app";

const getRedirectUri = (req: VercelRequest) => {
  const host = req.headers.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/auth/google/callback`;
};

export async function googleLogin(req: VercelRequest, res: VercelResponse) {
  const redirectUri = getRedirectUri(req);
  const google = new arctic.Google(
    process.env.CLIENT_ID!,
    process.env.CLIENT_SECRET!,
    redirectUri,
  );

  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, [
    "profile",
    "email",
  ]);

  // location + 302 = automatic redirect
  res.setHeader("Set-Cookie", [
    `google_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
    `google_code_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
  ]);

  return res.redirect(302, url.toString());
}

export default async function googleCallback(
  req: VercelRequest,
  res: VercelResponse,
) {
  const redirectUri = getRedirectUri(req);
  const google = new arctic.Google(
    process.env.CLIENT_ID!,
    process.env.CLIENT_SECRET!,
    redirectUri,
  );
  const code = req.query.code as string;
  const state = req.query.state as string;

  const storedState = req.cookies.google_oauth_state;
  const storedCodeVerifier = req.cookies.google_code_verifier;

  if (
    !code ||
    !state ||
    !storedState ||
    !storedCodeVerifier ||
    state !== storedState
  ) {
    res.redirect(302, `${FRONTEND_URL}/login?error=google_auth_failed`);
  }

  try {
    const tokens = await google.validateAuthorizationCode(
      code,
      storedCodeVerifier,
    );

    const googleResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
      },
    );
    const googleUser = await googleResponse.json();

    const googlePassword = crypto.randomUUID();
    const query =
      await pg`select * from users where email = ${googleUser.email}`;

    if (query.length === 0) {
      await generateUser(googleUser.email, googleUser.name, googlePassword);
    }

    const user =
      await pg`select * from users where email = ${googleUser.email}`;
    const device = req.headers?.["user-agent"] || "null";
    const token = await createSessionTokens(user[0].user_id, user[0].email, device);

    return res.redirect(
      302,
      `${FRONTEND_URL}/auth/success#access_token=${token.accessToken}&refresh_token=${token.refreshToken}`,
    );
  } catch (error) {
    console.log(error);

    return res.redirect(302, `${FRONTEND_URL}/login?error=google_auth_failed`);
  }
}

export async function generateUser(
  email: string,
  username: string,
  password: string,
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
  password: string,
): Promise<UserDetails | null> {
  const query = await pg`select * from users where email = ${email}`;
  console.log(query, email, password);
  if (query.length === 0) {
    // doing fake hash to make it slower on fails, prevents attackers from checking which accounts don't exist
    await bcrypt.hash(password, SALT_ROUNDS);

    return null;
  }

  const user = query[0];
  // need to change this for how it is returned in a table
  const checkPassword = await bcrypt.compare(password, user.password_hash);
  console.log(checkPassword, "test");
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
export async function register(request: VercelRequest) {
  try {
    // console.log(request);
    const body = request.body;
    const email = body.email;
    const password = body.password;
    const username = body.username;

    if (!email || !password || !username) {
      return jsonHelper(
        { error: "Email, password, and username required" },
        400,
      );
    }

    if (password.length < 7) {
      return jsonHelper(
        { error: "Password must be at least 7 characters long" },
        400,
      );
    }

    const user = await generateUser(email, username, password);

    return jsonHelper({ message: "User has been created", user: user.id }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "User already exists") {
      return jsonHelper({ error: "User with this email already exists" }, 409);
    }

    // console.log(error);

    return jsonHelper(
      { error: "Error occurred during registration", errorLog: error },
      500,
    );
  }
}

export async function login(request: VercelRequest) {
  try {
    const body = request.body;
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

    const device = request.headers?.["user-agent"] || "null";
    const tokens = await createSessionTokens(user.id, user.email, device);

    return jsonHelper(tokens);
  } catch (error) {
    console.log(error);
    return jsonHelper({ error: "Login failed" }, 500);
  }
}

export async function refresh(request: VercelRequest) {
  try {
    const body = request.body;
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
      revokeRefreshTokenSession(storedRefreshToken.session_id);
      return jsonHelper({ error: "Revoked all sessions" }, 401);
    }

    // revoke old token
    revokeRefreshToken(verifiedRefreshToken.jwt_id as string);

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
      storedRefreshToken.session_id,
      storedRefreshToken.device_info,
      newRefreshToken.tokenId,
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
      401,
    );
  }
}

export const logout = authHelper(
  async (request: AuthReq): Promise<Response> => {
    try {
      const body = request.body;
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
  },
);

export const logoutAll = authHelper(async (req: AuthReq): Promise<Response> => {
  await revokeAllUserRefreshTokens(req.user!.subject_claim);

  return jsonHelper({ message: "All sessions logged out" });
});
export async function forgotPassword(request: VercelRequest) {
  const body = await request.body;

  if (!body.email) {
    return jsonHelper(
      {
        error: "Email not provided",
      },
      400,
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
      404,
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
    process.cwd(),
    "public",
    "pictures",
    "office_pic.jpg",
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
    console.log(error);
    return jsonHelper({ error: "Mail failed to send" }, 500);
  }
}

export async function resetPassword(request: VercelRequest) {
  const body = request.body;
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
      404,
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

export const getUserPurchases = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const pathname = req.url?.split("?")[0] ?? "";
    const components = pathname.split("/").filter(Boolean);

    if (
      components.length !== 3 ||
      components[0] !== "users" ||
      components[2] !== "purchases"
    ) {
      return jsonHelper({ error: "Invalid purchases route path!" }, 400);
    }

    const pathUserId = components[1];
    if (req.user!.subject_claim !== pathUserId) {
      return jsonHelper(
        {
          error:
            "User is not logged on or lacks authorization to access orders",
        },
        401,
      );
    }

    const userRows = await isUserIdValid(pathUserId);
    if (!userRows) {
      return jsonHelper({ error: "User not found!" }, 404);
    }

    const accept =
      req.headers?.accept || req.headers?.Accept || "application/json";
    const wantsJson =
      String(accept).includes("application/json") || String(accept) === "*/*";
    const wantsXml =
      String(accept).includes("application/xml") ||
      String(accept).includes("text/xml");
    if (!wantsJson && !wantsXml) {
      return jsonHelper({ error: "Unsupported formatting type" }, 406);
    }

    try {
      const orders = await getUserBuyerOrders(req.user!.subject_claim);
      return jsonHelper({ orders }, 200);
    } catch {
      return jsonHelper({ error: "Internal Server Error" }, 500);
    }
  },
);

// For GET users/{userId}/sales

export const getUserSales = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const pathname = req.url?.split("?")[0] ?? "";
    const components = pathname.split("/").filter(Boolean);

    if (
      components.length !== 3 ||
      components[0] !== "users" ||
      components[2] !== "sales"
    ) {
      return jsonHelper({ error: "Invalid sales route path!" }, 400);
    }

    const pathUserId = components[1];
    if (req.user!.subject_claim !== pathUserId) {
      return jsonHelper(
        {
          error:
            "User is not logged on or lacks authorization to access orders",
        },
        401,
      );
    }

    const userRows = await isUserIdValid(pathUserId);
    if (!userRows) {
      return jsonHelper({ error: "User not found!" }, 404);
    }

    const accept =
      req.headers?.accept || req.headers?.Accept || "application/json";
    const wantsJson =
      String(accept).includes("application/json") || String(accept) === "*/*";
    const wantsXml =
      String(accept).includes("application/xml") ||
      String(accept).includes("text/xml");
    if (!wantsJson && !wantsXml) {
      return jsonHelper({ error: "Unsupported formatting type" }, 406);
    }

    try {
      const orders = await getUserSellerOrders(req.user!.subject_claim);
      return jsonHelper({ orders }, 200);
    } catch {
      return jsonHelper({ error: "Internal Server Error" }, 500);
    }
  },
);

export const getUserSessions = authHelper(
  async (req: AuthReq): Promise<Response> => {
    const userId = req.user?.subject_claim as string;
    const userSessions = await getAllUserRefreshTokens(userId);

    const sessionInfo = userSessions.map((session: any) => ({
      deviceInfo: session.deviceInfo,
      createdAt: session.created,
      expiresAt: session.expires,
    }));

    return jsonHelper({
      session: sessionInfo,
    });
  },
);

export const getUserDetailsById = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.url?.split("/").at(2);
      const response = await getUserById(userId as string);

      return jsonHelper({
        message: "User details successfully fetched",
        response: response,
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Cannot get user details",
          error: error,
        },
        500,
      );
    }
  },
);

export const getMyProfileDetails = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const response = await getUserById(req.user?.subject_claim as string);

      return jsonHelper({
        message: "Profile details successfully fetched",
        response: response,
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Cannot get user details",
          error: error,
        },
        500,
      );
    }
  },
);

export const deleteUser = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const response = await removeUserById(req.user?.subject_claim as string);

      return jsonHelper({
        message: "User successfully deleted",
        response: response,
      });
    } catch (error) {
      console.log(error);
      return jsonHelper(
        {
          message: "Failed to delete user",
          error: error,
        },
        500,
      );
    }
  },
);

export const updateProfile = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.user?.subject_claim as string;
      const body = req.body;

      if (!body.username && !body.email && !body.password) {
        return jsonHelper(
          {
            message: "No fields to update for the user",
          },
          400,
        );
      }

      await updateProfileQuery(userId, {
        user_name: body.username,
        email: body.email,
        password: body.password,
      });

      return jsonHelper({
        message: "Details successfully updated",
      });
    } catch (error) {
      return jsonHelper(
        { message: "Profile failed to update", error: error },
        500,
      );
    }
  },
);

export const verifyTwoFactor = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.user?.subject_claim as string;
      const { code } = req.body;

      if (!code) {
        return jsonHelper(
          {
            message: "No code given",
          },
          400,
        );
      }

      const query = await pg` 
        select totp 
        from users 
        where user_id = ${userId}
      `;

      if (!query[0].totp) {
        return jsonHelper(
          {
            message: "2FA not yet added",
          },
          400,
        );
      }

      const result = await verify({ secret: query[0].totp, token: code });

      if (!result.valid) {
        return jsonHelper(
          {
            message: "Code given is invalid",
          },
          400,
        );
      }

      await pg`
        update users
        set two_factor = true
        where user_if = ${userId}
      `;

      return jsonHelper({
        message: "2FA successfully verified",
      });
    } catch (error) {
      return jsonHelper({ message: "2FA failed to verify", error: error }, 500);
    }
  },
);

// Returns a QR code to add to google authenticator
// Submit a code from authenticator to verifyTwoFactor after
export const addTwoFactor = authHelper(
  async (req: AuthReq): Promise<Response> => {
    try {
      const userId = req.user?.subject_claim as string;
      const query = await pg`
        select email 
        from users 
        where user_id = ${userId}
      `;

      // Generate a secret
      const secret = generateSecret();

      await pg` 
        update users 
        set totp_key = ${secret} 
        where user_id ${userId}
      `;

      // Generate QR code URI for authenticator apps
      const uri = generateURI({
        issuer: "SassySquad",
        label: query[0].email,
        secret,
      });

      const qrCode = await qrcode.toDataURL(uri);

      return jsonHelper({
        message: "QR code successfully sent",
        qrCode,
      });
    } catch (error) {
      return jsonHelper({ message: "2FA failed to set up", error: error }, 500);
    }
  },
);
