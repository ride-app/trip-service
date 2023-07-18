import { Code, ConnectError, type HandlerContext } from "@bufbuild/connect";
import {
	GetTripRequest,
	GetTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

import type { Service } from "./service.js";

async function getTrip(
	_service: Service,
	req: GetTripRequest,
	context: HandlerContext,
): Promise<GetTripResponse> {
	try {
		// trunk-ignore(eslint/@typescript-eslint/no-unsafe-assignment)
		// trunk-ignore(eslint/@typescript-eslint/no-unsafe-call)
		// trunk-ignore(eslint/@typescript-eslint/no-unsafe-member-access)
		const uid = context.requestHeader.get("uid");
		const tripId = req.name.split("/").pop()!;
		const trip = await _service.tripRepository.getTrip(tripId);

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
