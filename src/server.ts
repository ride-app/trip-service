import { createServer } from "http2";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { initializeService } from "./trip-service/service.js";

const server = createServer(connectNodeAdapter({ routes: initializeService }));

export default server;
