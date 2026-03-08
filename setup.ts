import { SQL } from "bun";
import fs from 'node:fs';

const sql = new SQL(process.env.DATABASE_URL!);

async function deploy() {
  try {
    console.log("Reading schema...");

    const instructions = fs.readFileSync('src/database/schema.sql', 'utf8');

    console.log("Establishing connection...");

    await sql.unsafe(instructions);

    console.log("Database is now ready.");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Something went wrong:", error.message);
    } else {
      console.error("Something went wrong:", error);
    }
  }
}

deploy();