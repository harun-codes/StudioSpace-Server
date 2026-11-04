
import { createRemoteJWKSet, jwtVerify } from "jose";

const CLIENT_URL = process.env.CLIENT_URL?.trim();

if (!CLIENT_URL) {
  throw new Error("CLIENT_URL is missing.");
}

const AUTH_BASE_URL = new URL(CLIENT_URL).origin;

const ACCEPTED_ISSUERS = [
  AUTH_BASE_URL,
  `${AUTH_BASE_URL}/`,
];

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", `${AUTH_BASE_URL}/`)
);

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token is required.",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      message: "Authentication token is missing.",
    });
  }

  try {
    const unverifiedPayload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    );

    console.log("JWT issuer diagnostic:", {
      actualIssuer: unverifiedPayload.iss,
      expectedIssuer: ACCEPTED_ISSUERS,
      actualAudience: unverifiedPayload.aud,
      expectedAudience: ACCEPTED_ISSUERS,
    });

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ACCEPTED_ISSUERS,
      audience: ACCEPTED_ISSUERS,
    });

    const userId =
      typeof payload.sub === "string" ? payload.sub : null;

    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : null;

    const name =
      typeof payload.name === "string" ? payload.name : "";

    if (!userId || !email) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    req.auth = {
      userId,
      email,
      name,
    };

    return next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      message: "Invalid or expired authentication token.",
    });
  }
};
