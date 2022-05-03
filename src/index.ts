import { ServerCredentials } from "@grpc/grpc-js";
import { initializeApp } from "firebase-admin/app";
import server from "./server";

const port = process.env.PORT || 50051;

server.bindAsync(
	`localhost:${port}`,
	ServerCredentials.createInsecure(),
	(err, p) => {
		if (err) {
			console.error(err);
			return;
		}

		initializeApp();
		server.start();
		console.info(`${Date.now()}: server listening to port ${p}`);
	}
);
