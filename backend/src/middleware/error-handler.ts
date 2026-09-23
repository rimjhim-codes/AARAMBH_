import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    });
  }

  if ((error as { name?: string })?.name === "CastError") {
    return res.status(400).json({ message: "Invalid resource identifier", code: "INVALID_ID" });
  }

  const providerError = error as { provider?: string; failures?: unknown; code?: string; message?: string };
  if (providerError.provider || providerError.code === "provider_unavailable") {
    return res.status(502).json({
      message: providerError.message || "External provider unavailable",
      code: providerError.code || "PROVIDER_ERROR",
      provider: providerError.provider,
      failures: providerError.failures
    });
  }

  const status = Number((error as { statusCode?: number; status?: number })?.statusCode || (error as { status?: number })?.status);
  if (status >= 400 && status < 600) {
    return res.status(status).json({
      message: (error as Error)?.message || "Request failed",
      code: (error as { code?: string })?.code || "REQUEST_ERROR"
    });
  }

  console.error("Unhandled request error", error);
  return res.status(500).json({ message: "Internal server error", code: "INTERNAL_ERROR" });
};
