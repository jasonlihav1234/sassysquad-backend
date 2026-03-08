import { sql } from "./client";
import fs from "node:fs";

async function deploy() {
  try {
    console.log("Reading schema...");

    const schemaPath = `${import.meta.dir}/schema.sql`;
    const instructions = fs.readFileSync(schemaPath, "utf8");

    console.log("Establishing connection...");

    await sql.unsafe(instructions);

    console.log("Database is now ready.");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Something went wrong:", error.message);
    } else {
      console.error("Something went wrong:", error);
    }
  } finally {
    console.log("Closing connection");
    await sql.close();
  }
}

deploy();
