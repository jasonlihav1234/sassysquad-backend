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
    ${expires},
    ${false},
    ${deviceInfo},
    ${new Date()},
    ${sessionId}
  )
  `;
}

export async function getRefreshToken(
  tokenId: string,
): Promise<TokenMetadata | null> {
  // get the token from the database
  const tokenHash = await bcrypt.hash(tokenId, SALT_ROUNDS);
  const query =
    await pg`select * from refresh_tokens where token_hash = ${tokenHash}`;

  if (!query) {
    return null;
  }

  return query[0] as TokenMetadata;
}

export async function revokeRefreshToken(tokenId: string): Promise<boolean> {
  // get token from database
  const tokenHash = await bcrypt.hash(tokenId, SALT_ROUNDS);
  const query =
    await pg`select * from refresh_tokens where token_hash = ${tokenHash}`;

  if (query.length === 1) {
    await pg`update refresh_tokens
             set
              revoked = true
             where
              token_hash = ${tokenHash}`;

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
            userId = ${userId}`;
}

export function getAllUserRefreshTokens(userId: string): any {
  // query which gets all refresh tokens that are not revoked and userId === userId
  const query = pg`select * from refresh_tokens where user_id = ${userId} and revoked = false and expires > ${new Date()}`;

  return query;
}

// export function deleteExpiredRefreshTokens(): number {
//   const now = new Date();
//   let removed = 0;

//   // query all refresh tokens
//   // delet all refresh tokens with date < now
// }
