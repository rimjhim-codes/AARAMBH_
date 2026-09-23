import mongoose from "mongoose";
import { env } from "./env";

export async function connectDb() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
    connectTimeoutMS: env.mongoConnectTimeoutMs,
    maxPoolSize: env.mongoMaxPoolSize,
    minPoolSize: env.mongoMinPoolSize,
    maxIdleTimeMS: env.mongoMaxIdleTimeMs,
    waitQueueTimeoutMS: env.mongoWaitQueueTimeoutMs
  });
}
