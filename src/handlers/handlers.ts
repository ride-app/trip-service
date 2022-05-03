import { Status } from "@grpc/grpc-js/build/src/constants";
import { ITripService } from "../gen/ride/trip/v1alpha1/trip_service.grpc-server";

import createTrip from "./create-trip/create-trip";
import verifyAuthHeader from "../utils/verify-auth-header";
import { ExpectedError, Reason } from "../utils/errors/expected-error";
import getTrip from "./get-trip/get-trip";
import sendTripVerificationCode from "./send-trip-verification-code/send-trip-verification-code";

function handleError(callback: CallableFunction, error: unknown) {
	let code = Status.INTERNAL;
	let message = "Something Went Wrong";

	if (error instanceof ExpectedError) {
		switch (error.reason) {
			case Reason.INVALID_AUTH:
				code = Status.UNAUTHENTICATED;
				break;

			case Reason.UNAUTHORIZED:
				code = Status.PERMISSION_DENIED;
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

// class TripService {
// 	private readonly m: number = 5;

// 	public handlers: ITripService = {
// 		createTrip: async (call, callback) => {
// 			try {
// 				const uid = await verifyAuthHeader(call.metadata);
// 				const res = await createTrip(call.request, uid);

// 				callback(null, res);
// 			} catch (error) {
// 				handleError(callback, error);
// 			}
// 		},

// 		getTrip: async (call, callback) => {
// 			try {
// 				const uid = await verifyAuthHeader(call.metadata);
// 				const res = await getTrip(call.request, uid);

// 				callback(null, res);
// 			} catch (error) {
// 				handleError(callback, error);
// 			}
// 		},

// 		sendTripVerificationCode: async (call, callback) => {
// 			try {
// 				const uid = await verifyAuthHeader(call.metadata);
// 				const res = await sendTripVerificationCode(call.request, uid);

// 				callback(null, res);
// 			} catch (error) {
// 				handleError(callback, error);
// 			}
// 		},

// 		startTrip: async (_call, callback) => {
// 			callback({ code: Status.UNIMPLEMENTED });
// 		},

// 		cancelTrip: async (_call, callback) => {
// 			callback({ code: Status.UNIMPLEMENTED }, null);
// 		},

// 		endTrip: async (_call, callback) => {
// 			callback({ code: Status.UNIMPLEMENTED }, null);
// 		},

// 		getTripUpdates: async (call) => {
// 			call.end();
// 		},
// 	};
// }

const handlers: ITripService = {
	createTrip: async (call, callback) => {
		try {
			const uid = await verifyAuthHeader(call.metadata);
			const res = await createTrip(call.request, uid);

			callback(null, res);
		} catch (error) {
			handleError(callback, error);
		}
	},

	getTrip: async (call, callback) => {
		try {
			const uid = await verifyAuthHeader(call.metadata);
			const res = await getTrip(call.request, uid);

			callback(null, res);
		} catch (error) {
			handleError(callback, error);
		}
	},

	sendTripVerificationCode: async (call, callback) => {
		try {
			const uid = await verifyAuthHeader(call.metadata);
			const res = await sendTripVerificationCode(call.request, uid);

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

	endTrip: async (_call, callback) => {
		callback({ code: Status.UNIMPLEMENTED }, null);
	},

	getTripUpdates: async (call) => {
		call.end();
	},
};

export default handlers;
