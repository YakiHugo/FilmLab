import { createHash, randomBytes } from "node:crypto";
import { createId } from "../../../shared/createId";

export type GeneratedImageVisibility = "private";

export interface GeneratedImageCapability {
  imageId: string;
  privateToken: string;
  privateTokenHash: string;
  imageUrl: string;
}

const buildCapabilityToken = () => randomBytes(24).toString("base64url");

export const hashGeneratedImageToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const buildGeneratedImageUrl = (imageId: string, token: string) =>
  `/api/generated-images/${encodeURIComponent(imageId)}?token=${encodeURIComponent(token)}`;

export const createGeneratedImageCapability = (): GeneratedImageCapability => {
  const imageId = createId("generated-image");
  const privateToken = buildCapabilityToken();
  return {
    imageId,
    privateToken,
    privateTokenHash: hashGeneratedImageToken(privateToken),
    imageUrl: buildGeneratedImageUrl(imageId, privateToken),
  };
};
