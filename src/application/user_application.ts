import { config } from "../utils/jwt_config";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { SQL, sql } from "bun";
import bcrypt from "bcrypt";

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
// ! means that we are sure that it is defined
const PG = new SQL(process.env.DATABASE_URL!);

// unique token ID for tracking and revocation
function generateTokenId(): string {
  return crypto.randomUUID();
}

export async function generateUser(
  email: string,
  password: string,
): Promise<UserDetails> {
  const user = await PG`select * from users where email = ${email}`;

  if (user) {
    throw new Error("User already exists");
  }

  const hashPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser: UserDetails = {
    email: email,
    password: hashPassword,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  await PG`insert into users (user_id, email, password, created_at) 
            values (${newUser.id}, ${newUser.email}, ${newUser.password}, ${newUser.createdAt})`;

  return newUser;
}
