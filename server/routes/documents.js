"use strict";

/**
 * Document parsing routes.
 *   POST /api/parse/document — parse PDF, DOCX, or plain text requirement files
 */

const { Router } = require("express");
const path = require("path");
const multer = require("multer");
const config = require("../config");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
});

router.post("/document", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided." });

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = "";

    if (ext === ".pdf") {
      // pdf-parse v2 exports the function directly
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(req.file.buffer);
      text = result.text;
    } else if (ext === ".docx") {
      const mammoth = require("mammoth");
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = data.value;
    } else {
      text = req.file.buffer.toString("utf-8");
    }

    res.json({ ok: true, text, filename: req.file.originalname, size: text.length });
  } catch (err) {
    res.status(500).json({ error: `Parse error: ${err.message}` });
  }
});

module.exports = router;
