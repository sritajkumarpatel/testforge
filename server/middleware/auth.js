"use strict";

/**
 * Auth middleware — optional bearer token protection.
 * If AUTH_TOKEN is set in config, all protected routes require
 * Authorization: Bearer <token> header.
 */

const config = require("../config");

function requireAuth(req, res, next) {
  if (!config.authToken) return next();
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer" && parts[1] === config.authToken) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Set Authorization: Bearer <token> header." });
}

module.exports = { requireAuth };
