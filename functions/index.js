const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

exports.notifyAccessRequest = onDocumentCreated("users/{userId}", async (event) => {
  const data = event.data.data();
  if (!data || data.status !== "pending") return;

  const who = data.email || data.name || "(unknown)";
  logger.info("New access request from " + who);

  if (!ADMIN_EMAIL || !SMTP_USER || !SMTP_PASS) {
    logger.warn("SMTP/admin not configured; skipping email. In-app request still visible.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to: ADMIN_EMAIL,
      subject: "Rider Performance System — New access request",
      text:
        "New access request from " + who + ".\n\n" +
        "Open the dashboard and choose Options -> Access Requests to approve " +
        "and set which hubs and actions this user can use.",
    });
    logger.info("Access request email sent to " + ADMIN_EMAIL);
  } catch (err) {
    logger.error("Failed to send access request email", err);
  }
});
