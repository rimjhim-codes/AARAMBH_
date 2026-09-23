import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { validateOfficePackage } from "../services/document-parser.service";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const mimeByExtension: Record<string, string[]> = {
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
  ".txt": ["text/plain", "application/octet-stream"],
  ".md": ["text/markdown", "text/plain", "application/octet-stream"],
  ".mp4": ["video/mp4", "application/octet-stream"],
  ".webm": ["video/webm", "application/octet-stream"],
  ".mov": ["video/quicktime", "application/octet-stream"],
  ".avi": ["video/x-msvideo", "application/octet-stream"]
};

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

function hasMagic(buffer: Buffer, extension: string) {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if ([".docx", ".pptx"].includes(extension)) return buffer.subarray(0, 4).toString("binary") === "PK\x03\x04";
  if (extension === ".mp4" || extension === ".mov") return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  if (extension === ".webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === ".avi") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "AVI ";
  if ([".txt", ".md"].includes(extension)) return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
  return false;
}

async function optionalMalwareScan(file: Express.Multer.File) {
  const scannerUrl = process.env.CLAMAV_SCAN_URL;
  if (!scannerUrl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(scannerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Filename": file.originalname },
      body: new Uint8Array(file.buffer),
      signal: controller.signal
    });
    const body = (await response.text()).slice(0, 500);
    if (!response.ok || /virus|infected|malware|found/i.test(body)) {
      throw new Error(`Malware scanner rejected the upload (${response.status}): ${body}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

export async function validateUploadedFile(req: Request, res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "file is required" });
  const extension = extensionOf(file.originalname);
  const allowedMimes = mimeByExtension[extension];
  if (!allowedMimes) return res.status(400).json({ message: "Unsupported file type." });
  if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
    return res.status(400).json({ message: `MIME type does not match ${extension} file extension.` });
  }
  if (!file.buffer.length || file.buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ message: "Upload is empty or exceeds the 200 MB limit." });
  }
  if (!hasMagic(file.buffer, extension)) return res.status(400).json({ message: "File signature does not match its extension." });

  try {
    if (extension === ".docx" || extension === ".pptx") await validateOfficePackage(file.buffer, extension.slice(1) as "docx" | "pptx");
    await optionalMalwareScan(file);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Upload validation failed." });
  }

  const sourceType = String(req.body?.sourceType || "").toLowerCase();
  const expectedSourceType = extension === ".pdf" ? "pdf" : extension === ".docx" ? "docx" : extension === ".pptx" ? "pptx" : [".txt", ".md"].includes(extension) ? "transcript" : "video";
  if (sourceType && sourceType !== expectedSourceType) return res.status(400).json({ message: `sourceType must be '${expectedSourceType}' for this file.` });
  req.body.sourceType = expectedSourceType;
  return next();
}

/** Reuses the exact Phase 7 validation while allowing a request with no file. */
export async function validateOptionalUploadedFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file) return next();
  return validateUploadedFile(req, res, next);
}
