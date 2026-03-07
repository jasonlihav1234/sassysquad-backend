import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

const sql = neon(process.env.DATABASE_URL!);

async function deploy() {
  try {
    console.log("Reading schema...");

    const instructions = fs.readFileSync('src/database/schema.sql', 'utf8');

    console.log("Establishing connection...");

    await sql.unsafe(instructions);

    console.log("Database is now ready.");
  } catch (error) {
    console.error("Something went wrong:", error);
  }
}

deploy();