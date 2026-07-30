import winston from "winston";

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.colorize(),
    process.env.NODE_ENV !== "production"
      ? winston.format.simple()
      : winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
