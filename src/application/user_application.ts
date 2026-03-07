import { config } from "../utils/jwt_config";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  subject_claim: string;
  email: string;
  type: "access" | "refresh";
  jwt_id: string;
}

// converts secret strings to Uint8Array for jose library
const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.refreshSecret);

// unique token ID for tracking and revocation
function generateTokenId(): string {
  return crypto.randomUUID();
}
