import { SQL, RedisClient } from "bun";

// ! means that we are sure that it is defined
const pg = new SQL(process.env.DATABASE_URL!);
export const redis = new RedisClient(process.env.KV_URL!);

export default pg;
