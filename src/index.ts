import { initializeApp } from "firebase-admin/app";
import server from "./server.js";

const port = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 50051;

try {
	initializeApp();
	console.log(process.env["PORT"]);
	console.log(port);

	server.listen(
		{
			host: "0.0.0.0",
			port,
		},
		(_, address) => {
			console.info(`[${Date.now()}]: server listening to ${address}`);
		}
	);
} catch (err) {
	console.error(err);
	process.exit(1);
}
