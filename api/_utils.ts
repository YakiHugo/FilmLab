import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

export interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (payload: unknown) => void;
}

export const readJsonBody = async (request: ApiRequest) => {
  if (typeof request.body === "string") {
    return JSON.parse(request.body) as unknown;
  }

  if (request.body && typeof request.body === "object") {
    return request.body as unknown;
  }

  if (typeof request.on !== "function") {
    return {};
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve());
    request.on("error", (error: unknown) =>
      reject(error instanceof Error ? error : new Error("Request stream failed."))
    );
  });

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as unknown;
};

export const sendError = (response: ApiResponse, status: number, message: string) => {
  response.status(status).json({ error: message });
};
