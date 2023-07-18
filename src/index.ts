import server from "./server.js";
import * as log from "./utils/logger.js";

const port = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 50051;

try {
	server
		.listen({
			host: "0.0.0.0",
			port,
		})
		.addListener("listening", () => {
			log.info(`server listening to ${port}`);
		});
} catch (err) {
	console.error(err);
	process.exit(1);
}
