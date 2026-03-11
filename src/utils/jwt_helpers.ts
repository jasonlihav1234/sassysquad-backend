import { verifyAccessToken, type TokenPayload } from "./jwt_config";
import pg from "../utils/db";
import { createHash } from "node:crypto";
import { VercelRequest } from "@vercel/node";

export interface AuthReq extends VercelRequest {
  user?: TokenPayload; // user is optional, can be undefined or not present
}

interface TokenMetadata {
  revoked: boolean;
  user_id: string;
  created: Date;
  expires: Date;
  token_id: string;
  session_id: string; // groups tokens for same login session
  device_info: string;
}
const SALT_ROUNDS = 10;

export function jsonHelper(data: object, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

// middleware func that validates JWT and attaches user to req
async function authMiddleware(request: AuthReq): Promise<AuthReq | Response> {
  const authHeader = request.headers?.["authorization"];

  if (!authHeader) {
    return jsonHelper({ error: "Authorization is header missing" }, 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return jsonHelper({ error: "Invalid auth format - use: Bearer" }, 401);
  }

  const token = authHeader.substring(7); // gets the token from bearer

  try {
    const payload = await verifyAccessToken(token);
    request.user = payload;

    return request;
  } catch (error) {
    return jsonHelper({ error: "Invalid or expired token" }, 401);
  }
}

// handler would be a passed callback into authHelper
export function authHelper(
  passedFunc: (req: AuthReq) => Promise<any>,
): (req: VercelRequest) => Promise<any> {
  return async (request: VercelRequest): Promise<any> => {
    const result = await authMiddleware(request as AuthReq);

    if (result instanceof Response) {
      return result;
    }
    // auth succeeded, call handler
    return passedFunc(result);
  };
}

export async function getAuthenticatedUserId(
  req: any,
  res: any,
  pathUserId?: string,
  unauthorizedMessage = "User is not logged on or lacks authorization to access orders",
) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
    res.status(401).json({ error: unauthorizedMessage });
    return null;
  }

  // "Bearer " slice
  const token = String(authHeader).slice(7);
  let tokenUserId: string;
  try {
    const payload = await verifyAccessToken(token);
    tokenUserId = payload.subject_claim as string;
  } catch {
    res.status(401).json({ error: unauthorizedMessage });
    return null;
  }

  if (pathUserId !== undefined && tokenUserId !== pathUserId) {
    res.status(401).json({ error: unauthorizedMessage });
    return null;
  }

  return tokenUserId;
}

export async function storeRefreshToken(
  userId: string,
  sessionId: string,
  deviceInfo: string,
  tokenId: string,
  expiresInDays: number = 7,
): Promise<void> {
  const expires = new Date();
  expires.setDate(expires.getDate() + expiresInDays);
  const tokenHash = createHash("sha256").update(tokenId).digest("hex");

  await pg`
  insert into refresh_tokens (
    token_id, 
    user_id, 
    token_hash, 
    expires, 
    revoked, 
    device_info, 
    created, 
    session_id
  )
  values (
    ${crypto.randomUUID()},
    ${userId},
    ${tokenHash},
    ${expires.toISOString()},
    ${false},
    ${deviceInfo || null},
    ${new Date().toISOString()},
    ${sessionId}
  )
  `;
}

export async function getRefreshToken(
  tokenId: string,
): Promise<TokenMetadata | null> {
  // get the token from the database
  const tokenHash = createHash("sha256").update(tokenId).digest("hex");

  const query =
    await pg`select * from refresh_tokens where token_hash = ${tokenHash}`;

  if (query.length === 0) {
    return null;
  }

  return query[0] as TokenMetadata;
}

export async function revokeRefreshToken(tokenId: string): Promise<boolean> {
  // get token from database
  const tokenHash = createHash("sha256").update(tokenId).digest("hex");

  const query = await pg`
    update refresh_tokens
    set revoked = true
    where token_hash = ${tokenHash}
    returning *
  `;

  if (query.length > 0) {
    return true;
  }

  return false;
}

export async function revokeRefreshTokenSession(
  sessionId: string,
): Promise<void> {
  // get all tokens with this session id
  await pg`update refresh_tokens
           set
            revoked = true
           where
            session_id = ${sessionId}`;
}

export async function revokeAllUserRefreshTokens(
  userId: string,
): Promise<void> {
  // sql statment which changes all userId == userId to true
  await pg`update refresh_tokens
           set
            revoked = true
           where
            user_id = ${userId}`;
}

export async function getAllUserRefreshTokens(userId: string): Promise<any> {
  // query which gets all refresh tokens that are not revoked and userId === userId
  const query =
    await pg`select * from refresh_tokens where user_id = ${userId} and revoked = false and expires > ${new Date().toISOString()}`;

  return query;
}

export async function deleteExpiredRefreshTokens(): Promise<void> {
  await pg`delete from refresh_tokens where expires < ${new Date().toISOString()}`;
}
