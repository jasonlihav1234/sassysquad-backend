import { verifyAccessToken, type TokenPayload } from "./jwt_config";

export interface AuthReq extends Request {
  user?: TokenPayload; // user is optional, can be undefined or not present
}

interface TokenMetadata {
  revoked: boolean;
  userId: string;
  created: Date;
  expires: Date;
  tokenId: string;
  familyId: string; // groups tokens for same login session
  deviceInfo: string;
}

function jsonHelper(data: object, status: number = 200): Response {
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
  familyId: string,
  deviceInfo: string,
  tokenId: string,
  expiresInDays: number = 7,
): Promise<void> {
  const expires = new Date();
  expires.setDate(expires.getDate() + expiresInDays);

  // add it to database
}

// export async function getRefreshToken(tokenId: string): Promise<TokenMetadata> {
//   // get the token from the database
// }

// export function revokeRefreshToken(tokenId: string): boolean {
//   // get token from database
//   if (refreshToken) {
//     refreshToken.revoked = true;
//     return true;
//   }

//   return false;
// }
