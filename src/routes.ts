export async function handleRequest(req, res) {
  const { method, url } = req;

  if (url === "/" && method == "GET") {
    const ret_val = {
      test: "hello",
    };

    return res.status(200).json(ret_val);
  }

  console.log(method, url);

  return res.status(404).json({ error: "Not found" });
}
