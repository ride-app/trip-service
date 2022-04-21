import { Server, ServerWritableStream } from '@grpc/grpc-js';

import { Status } from '@grpc/grpc-js/build/src/constants';
import {
	ITripService,
	tripServiceDefinition,
} from './gen/ride/trip/v1alpha1/trip_service.grpc-server';

// import startTrip from './start-trip';
import createTrip from './create-trip/create-trip';
import {
	GetTripUpdatesRequest,
	GetTripUpdatesResponse,
} from './gen/ride/trip/v1alpha1/trip_service';

const handlers: ITripService = {
	createTrip: async (call, callback) => {
		try {
			const res = await createTrip(call.request, call.metadata);

			callback(null, res);
		} catch (error) {
			callback({ code: Status.UNKNOWN }, null);
		}
	},

	// startTrip: async (call, callback) => {
	// 	try {
	// 		const res = await createTrip(call.request, call.metadata);

	// 		callback(null, res);
	// 	} catch (error) {
	// 		callback({ code: Status.UNKNOWN }, null);
	// 	}
	// },

	// cancelTrip: async (call, callback) => {
	// 	try {
	// 		const res = await createTrip(call.request, call.metadata);

	// 		callback(null, res);
	// 	} catch (error) {
	// 		callback({ code: Status.UNKNOWN }, null);
	// 	}
	// },

	// getTrip: async (call, callback) => {
	// 	try {
	// 		const res = await createTrip(call.request, call.metadata);

	// 		callback(null, res);
	// 	} catch (error) {
	// 		callback({ code: Status.UNKNOWN }, null);
	// 	}
	// },

	// endTrip: async (call, callback) => {
	// 	try {
	// 		const res = await createTrip(call.request, call.metadata);

	// 		callback(null, res);
	// 	} catch (error) {
	// 		callback({ code: Status.UNKNOWN }, null);
	// 	}
	// },

	getTripUpdates: async (
		call: ServerWritableStream<GetTripUpdatesRequest, GetTripUpdatesResponse>
	) => {
		try {
			call;
			// callback(null, res);
		} catch (error) {
			// callback({ code: Status.UNKNOWN }, null);
		}
	},
};

const server = new Server();

server.addService(tripServiceDefinition, handlers);

export default server;
