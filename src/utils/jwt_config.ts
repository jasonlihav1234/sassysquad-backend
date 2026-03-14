import { SignJWT, jwtVerify, type JWTPayload } from "jose";
// interface which the jwt's must follow
export interface TokenPayload extends JWTPayload {
  subject_claim: string;
  email: string;
  type: "access" | "refresh";
  jwt_id: string;
}
// contains our secret signing keys for access and refresh token, as well as TTL
export const config = {
  jwtSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.REFRESH_SECRET,
  accessTokenExpiry: "15m",
  refreshTokenExpiry: "7d",
};

// converts secret strings to Uint8Array for jose library, our signing keys
const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.refreshSecret);

// unique token ID for tracking and revocation
function generateTokenId(): string {
  return crypto.randomUUID();
}

export async function createAccessToken(
  userId: string,
  email: string,
): Promise<string> {
  const tokenId = generateTokenId();

  const token = await new SignJWT({
    subject_claim: userId,
    email: email,
    type: "access",
    jwt_id: tokenId,
  })
    .setProtectedHeader({ alg: "HS256" }) // using HS256 algorithm
    .setIssuedAt() // no argument = current time stamp
    .setExpirationTime(config.accessTokenExpiry)
    .setIssuer("saasysquad-auth")
    .setAudience("saasysquad-api")
    .sign(accessSecret); // signing our jwt so we know it's from us

  return token;
}

export async function createRefreshToken(
  userId: string,
  email: string,
): Promise<{ token: string; tokenId: string }> {
  const tokenId = generateTokenId();

  const token = await new SignJWT({
    subject_claim: userId,
    email: email,
    type: "refresh",
    jwt_id: tokenId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.refreshTokenExpiry)
    .setIssuer("saasysquad-auth")
    .setAudience("saasysquad-api")
    .sign(refreshSecret);
  // return 2 things so we can store in database
  return { token, tokenId };
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: "saasysquad-auth",
      audience: "saasysquad-api",
    });

    if (payload.type !== "access") {
      throw new Error("Invalid access type");
    }

    return payload as TokenPayload;
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      issuer: "saasysquad-auth",
      audience: "saasysquad-api",
    });

    if (payload.type !== "refresh") {
      throw new Error("Invalid refresh type");
    }

    return payload as TokenPayload;
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
}
