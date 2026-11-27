// _vercel_api_entry.ts
import crypto from "node:crypto";
import dotenv from "dotenv";
dotenv.config();
var PORT = Number(process.env.PORT || 3e3);
var SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "") + ":" + (process.env.RESEND_API_KEY || "") + ":fortifai-scale-v2"
).digest("hex");
startServer().catch((err) => {
  console.error("Failed to start Fortifai Scale server:", err);
  process.exit(1);
});
