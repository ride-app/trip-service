import { Status } from "@grpc/grpc-js/build/src/constants";
import { ITripService } from "./gen/ride/trip/v1alpha1/trip_service.grpc-server";

import createTrip from "./create-trip/create-trip";
import authMiddleware from "./middlewares/auth-middleware";
import { ExpectedError, Reason } from "./utils/errors/expected-error";
import getTrip from "./get-trip";

function handleError(callback: CallableFunction, error: unknown) {
	let code = Status.INTERNAL;
	let message = "Something Went Wrong";

	if (error instanceof ExpectedError) {
		switch (error.reason) {
			case Reason.INVALID_AUTH:
				code = Status.UNAUTHENTICATED;
				break;

			case Reason.INVALID_ARGUMENT:
				code = Status.INVALID_ARGUMENT;
				break;
			case Reason.ALREADY_EXISTS:
				code = Status.ALREADY_EXISTS;
				break;
			case Reason.BAD_STATE:
				code = Status.FAILED_PRECONDITION;
				break;
			case Reason.NOT_FOUND:
				code = Status.NOT_FOUND;
				break;

			default:
				break;
		}
		message = error.message;
	}

	callback({
		code,
		message,
	});
}

const handlers: ITripService = {
	createTrip: async (call, callback) => {
		try {
			const uid = await authMiddleware(call.metadata);
			const res = await createTrip(call.request, uid);

			callback(null, res);
		} catch (error) {
			handleError(callback, error);
		}
	},

	startTrip: async (_call, callback) => {
		callback({ code: Status.UNIMPLEMENTED });
	},

	cancelTrip: async (_call, callback) => {
		callback({ code: Status.UNIMPLEMENTED }, null);
	},

	getTrip: async (call, callback) => {
		try {
			const uid = await authMiddleware(call.metadata);
			const res = await getTrip(call.request, uid);

			callback(null, res);
		} catch (error) {
			handleError(callback, error);
		}
	},

	endTrip: async (_call, callback) => {
		callback({ code: Status.UNIMPLEMENTED }, null);
	},

	getTripUpdates: async (call) => {
		try {
			call.end();
			// callback(null, res);
		} catch (error) {
			// callback({ code: Status.UNKNOWN }, null);
		}
	},
};

export default handlers;
