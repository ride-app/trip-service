import { Code, ConnectError, HandlerContext } from "@bufbuild/connect";
import {
	GetTripRequest,
	GetTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

import { getTrip as getTripFromRepo } from "../repositories/trip-repository.js";

async function getTrip(
	req: GetTripRequest,
	context: HandlerContext
): Promise<GetTripResponse> {
	try {
		const uid = context.requestHeader.get("uid");
		const tripId = req.name.split("/").pop()!;
		const trip = await getTripFromRepo(tripId);

		if (!trip) {
			throw new ConnectError("Trip not found", Code.NotFound);
		}

		if (
			trip.rider?.name.split("/").pop() !== uid ||
			trip.driver?.name.split("/").pop() !== uid
		) {
			throw new ConnectError("Unauthorized", Code.PermissionDenied);
		}

		return new GetTripResponse({ trip });
	} catch (err) {
		console.error(err);
		throw new ConnectError("Internal server error", Code.Internal);
	}
}

export default getTrip;
