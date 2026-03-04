import { handleRequest } from "../routes";

export default async function handler(req, res) {
  return handleRequest(req, res);
}
