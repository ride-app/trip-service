import server from "./server.js";
import { logError, logNotice } from "./utils/logger.js";

const port = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 50051;

try {
	server
		.listen({
			host: "0.0.0.0",
			port,
		})
		.addListener("listening", () => {
			logNotice(`Server listening to ${port}`);
		});
} catch (err) {
	logError("Error starting server", err);
	process.exit(1);
}
