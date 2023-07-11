import { initializeApp } from "firebase-admin/app";
import server from "./server.js";

const port = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 50051;

try {
	initializeApp();
	server
		.listen({
			host: "0.0.0.0",
			port,
		})
		.addListener("listening", () => {
			console.info(`[${Date.now()}]: server listening to ${port}`);
		});
} catch (err) {
	console.error(err);
	process.exit(1);
}
