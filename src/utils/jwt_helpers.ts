import { verifyAccessToken, type TokenPayload } from "./jwt_config";
import pg from "../utils/db";
import bcrypt from "bcrypt";

export interface AuthReq extends Request {
  user?: TokenPayload; // user is optional, can be undefined or not present
}

interface TokenMetadata {
  revoked: boolean;
  userId: string;
  created: Date;
  expires: Date;
  tokenId: string;
  sessionId: string; // groups tokens for same login session
  deviceInfo: string;
}
const SALT_ROUNDS = 10;

export function jsonHelper(data: object, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

// middleware func that validates JWT and attaches user to req
export async function authMiddleware(
  request: AuthReq,
): Promise<AuthReq | Response> {
  const authHeader = request.headers.get("Authorization");

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
): (req: Request) => Promise<any> {
  return async (request: Request): Promise<any> => {
    const result = await authMiddleware(request as AuthReq);

    if (result instanceof Response) {
      return result;
    }
    // auth succeeded, call handler
    return passedFunc(result);
  };
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
  const tokenHash = await bcrypt.hash(tokenId, SALT_ROUNDS);

  // add it to database
  await pg`insert into refreshtokens (token_id, token_hash, session_id, user_id, expires, created, created, revoked)
    values (${crypto.randomUUID()}, ${tokenHash}, ${sessionId}, ${userId}, ${new Date()})`;
}

export async function getRefreshToken(
  tokenId: string,
): Promise<TokenMetadata | null> {
  // get the token from the database
  const tokenHash = await bcrypt.hash(tokenId, SALT_ROUNDS);
  const query =
    await pg`select * from refreshtokens where token_id = ${tokenHash}`;

  if (!query) {
    return null;
  }

  return query[0] as TokenMetadata;
}

// export function revokeRefreshToken(tokenId: string): boolean {
//   // get token from database
//   if (refreshToken) {
//     refreshToken.revoked = true;
//     return true;
//   }

//   return false;
// }

export function revokeRefreshTokenSession(sessionId: string): void {
  // get all tokens with this session id
}

export function revokeAllUserRefreshTokens(userId: string): void {
  // sql statment which changes all userId == userId to true
}

// export function getAllUserRefreshTokens(userId: string): StoredToken[] {
//   // query which gets all refresh tokens that are not revoked and userId === userId
// }

// export function deleteExpiredRefreshTokens(): number {
//   const now = new Date();
//   let removed = 0;

//   // query all refresh tokens
//   // delet all refresh tokens with date < now
// }
