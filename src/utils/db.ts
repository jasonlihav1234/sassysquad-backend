import { SQL } from "bun";

// ! means that we are that it is defined
const pg = new SQL(process.env.DATABASE_URL!);

export default pg;