import type { ApiRequest, ApiResponse } from "./_utils";

export default async function handler(_request: ApiRequest, response: ApiResponse) {
  response.statusCode = 410;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: "Text chat has been removed from this build." }));
}
