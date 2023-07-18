import { createLogger, transports, format } from "winston";
// Imports the Google Cloud client library for Winston
import { LoggingWinston } from "@google-cloud/logging-winston";

// Create a Winston logger that streams to Cloud Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
const logger = createLogger({
	level: process.env["DEBUG"] ? "debug" : "info",
	format: format.combine(
		format.timestamp(),
		format.json(),
		format.prettyPrint({
			colorize: true,
		}),
	),
	transports: [new transports.Console()],
});

// Add Cloud Logging
if (process.env["NODE_ENV"] !== "production") {
	logger.add(new LoggingWinston());
}

export default logger;
