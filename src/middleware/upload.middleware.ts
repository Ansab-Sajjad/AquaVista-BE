import multer from "multer";
import path from "path";
import fs from "fs";
import { AppError } from "./errorHandler";
import { Request } from "express";

const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
  "application/csv",
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

const MAX_SIZE_BYTES =
  parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10) * 1024 * 1024;
const MAX_AVATAR_SIZE_BYTES =
  parseInt(process.env.MAX_AVATAR_SIZE_MB || "5", 10) * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only .csv, .xlsx, .pdf, .doc and .docx files are supported", 415));
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
}).single("file");

const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function avatarFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (AVATAR_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only image files are supported", 415));
  }
}

export const avatarUploadMiddleware = multer({
  storage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
}).single("avatar");
