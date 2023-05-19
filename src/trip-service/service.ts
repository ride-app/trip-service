import type { ConnectRouter } from "@bufbuild/connect";
import { TripService } from "../gen/ride/trip/v1alpha1/trip_service_connect.js";
import verifyAuthHeader from "../utils/verify-auth-header.js";
import createTrip from "./create-trip.js";
import getTrip from "./get-trip.js";
import startTripVerification from "./start-trip-verification.js";
import startTrip from "./start-trip.js";

const routes = (router: ConnectRouter) =>
	router.service(TripService, {
		createTrip: async (req, context) => {
			await verifyAuthHeader(context);
			return createTrip(req);
		},
		getTrip: async (req, context) => {
			await verifyAuthHeader(context);
			return getTrip(req, context);
		},
		startTrip: async (req, context) => {
			await verifyAuthHeader(context);
			return startTrip(req, context);
		},
		startTripVerification: async (req, context) => {
			await verifyAuthHeader(context);
			return startTripVerification(req, context);
		},
	});

export default routes;
