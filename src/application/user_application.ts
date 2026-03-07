import { config } from "../utils/jwt_config";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { SQL, sql } from "bun";
import bcrypt from "bcrypt";
import pg from "../utils/db";

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

// unique token ID for tracking and revocation
function generateTokenId(): string {
  return crypto.randomUUID();
}

export async function generateUser(
  email: string,
  password: string,
): Promise<UserDetails> {
  const query = await pg`select * from users where email = ${email}`;

  if (query) {
    throw new Error("User already exists");
  }

  const user = query[0];
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

export async function checkUser(
  email: string,
  password: string,
): Promise<UserDetails | null> {
  const query = await pg`select * from users where email = ${email}`;

  if (!query) {
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
