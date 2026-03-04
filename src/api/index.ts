import { handleRequest } from "../routes";

export default async function handler(req, res) {
  console.log(req.url, req.method, req.query);
  return handleRequest(req, res);
}
