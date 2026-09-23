import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { connectDb } from "./config/db";
import { env } from "./config/env";
import { appRouter } from "./routes";
import { seedSihFoundation } from "./seeds/sih.seed";
import { bootstrapAdminRole, migrateLegacyRoles } from "./services/role.service";
import { authenticateSocket, canJoinUserRoom } from "./middleware/auth";
import { wrapRouter } from "./middleware/async-handler";
import { errorHandler } from "./middleware/error-handler";
import { securityHeaders, requireCsrfToken } from "./middleware/security";

async function bootstrap() {
  await connectDb();
  await migrateLegacyRoles();
  await bootstrapAdminRole();
  await seedSihFoundation().catch((err) => {
    console.warn("SIH seed skipped or partially applied:", err?.message || err);
  });
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true }
  });
  io.use(authenticateSocket);
  app.set("io", io);

  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(securityHeaders);
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", requireCsrfToken, wrapRouter(appRouter) as any);
  app.use(errorHandler);

  io.on("connection", (socket) => {
    socket.on("join-lecture", (lectureId: string) => socket.join(`lecture:${lectureId}`));
    socket.on("join-user", (userId: string) => {
      if (typeof userId === "string" && canJoinUserRoom((socket.data.user as { id: string }).id, userId)) {
        socket.join(`user:${userId}`);
      }
    });


  });

  server.listen(env.port, () => {
    console.log(`AARAMBH backend on :${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down gracefully.`);
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  };

  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
