import logger from "./logger";

type EnvVarSpec = {
  key: string;
  required: boolean;
  validate?: (value: string) => boolean;
  hint?: string;
};

const specs: EnvVarSpec[] = [
  { key: "NODE_ENV", required: false, validate: (v) => ["development", "production", "test"].includes(v) },
  { key: "PORT", required: false, validate: (v) => !isNaN(parseInt(v, 10)) },
  { key: "MONGODB_URI", required: true },
  { key: "JWT_SECRET", required: true, hint: "Use a long random string (>= 32 chars)" },
  { key: "JWT_EXPIRES_IN", required: false },
  { key: "JWT_REFRESH_SECRET", required: true, hint: "Use a different long random string from JWT_SECRET" },
  { key: "JWT_REFRESH_EXPIRES_IN", required: false },
  {
    key: "GMAIL_USER",
    required: false,
    validate: (v) => v.includes("@"),
    hint: "Should be a valid Gmail address",
  },
  { key: "GMAIL_APP_PASSWORD", required: false },
  { key: "FRONTEND_URL", required: false, validate: (v) => v.startsWith("http") },
  { key: "GEMINI_API_KEY", required: false },
  { key: "GEMINI_MODEL", required: false },
];

export function validateEnv(): void {
  const errors: string[] = [];

  for (const spec of specs) {
    const value = process.env[spec.key];

    if (value === undefined || value === "") {
      if (spec.required) {
        errors.push(`Missing required env var: ${spec.key}${spec.hint ? ` (${spec.hint})` : ""}`);
      }
      continue;
    }

    if (spec.validate && !spec.validate(value)) {
      errors.push(`Invalid value for env var ${spec.key}${spec.hint ? `: ${spec.hint}` : ""}`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.error(`Env validation error: ${e}`);
    }
    logger.error("Environment validation failed. Please fix the above errors and restart.");
    process.exit(1);
  }
}
