import Anthropic from "@anthropic-ai/sdk";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { parseIngredients, ParseModelError, type ImageMediaType, type ParseInput } from "../parse";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

// Detect the real image type from its first bytes instead of trusting the client's MIME type.
function sniffImageType(buf: Buffer): ImageMediaType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  return null;
}

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const error = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : "Send one image in the \"image\" field.";
      return res.status(status).json({ error });
    }
    if (err) return next(err);
    next();
  });
}

export const parseRouter = Router();

// POST /api/parse
// Text: JSON or form field "text". Photo: multipart field "image" (jpeg, png, or webp, max 5 MB).
parseRouter.post("/api/parse", handleUpload, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const file = req.file;

  if (text && file) return res.status(400).json({ error: "Send either text or an image, not both." });
  if (!text && !file) return res.status(400).json({ error: "Send some text or an image." });
  if (text.length > MAX_TEXT_CHARS)
    return res.status(400).json({ error: `Text must be ${MAX_TEXT_CHARS} characters or fewer.` });

  let input: ParseInput;
  if (file) {
    const mediaType = sniffImageType(file.buffer);
    if (!mediaType) return res.status(415).json({ error: "Image must be a JPEG, PNG, or WebP." });
    input = { kind: "image", data: file.buffer, mediaType };
  } else {
    input = { kind: "text", text };
  }

  try {
    res.json(await parseIngredients(input));
  } catch (err) {
    console.error("[parse]", err);
    if (err instanceof ParseModelError || err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: "We couldn't read your ingredients right now. Please try again." });
    }
    res.status(500).json({ error: "Something went wrong." });
  }
});
