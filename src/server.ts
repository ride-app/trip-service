import { Server } from "@grpc/grpc-js";
import { tripServiceDefinition } from "./gen/ride/trip/v1alpha1/trip_service.grpc-server";
import handlers from "./handlers/handlers";

const server = new Server();

server.addService(tripServiceDefinition, handlers);

export default server;
