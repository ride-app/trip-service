import { fastify } from "fastify";
import { fastifyConnectPlugin } from "@bufbuild/connect-fastify";
import routes from "./trip-service/service.js";

const server = fastify({ trustProxy: true });

await server.register(fastifyConnectPlugin, {
	routes,
});

export default server;
