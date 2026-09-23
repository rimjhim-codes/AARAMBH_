import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret
});

export async function uploadToCloudinary(base64Data: string, resourceType: "video" | "raw") {
  const result = await cloudinary.uploader.upload(base64Data, {
    resource_type: resourceType,
    folder: env.cloudinaryFolder || "aarambh"
  });
  return result.secure_url;
}
