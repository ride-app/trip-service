import { getDatabase } from "firebase-admin/database";
import { verify } from "jsonwebtoken";
import {
	StartTripRequest,
	StartTripResponse,
} from "../../gen/ride/trip/v1alpha1/trip_service";
import getTrip from "../../repositories/trip-repository";
import { ExpectedError, Reason } from "../../utils/errors/expected-error";

async function startTrip(
	req: StartTripRequest,
	uid: string
): Promise<StartTripResponse> {
	const trip = await getTrip(req.tripId);

	if (!trip) {
		throw new ExpectedError("Trip not found", Reason.NOT_FOUND);
	}

	if (trip.driverUid !== uid) {
		throw new ExpectedError("Unauthorized", Reason.UNAUTHORIZED);
	}

	const verCodeSnap = await getDatabase()
		.ref(`trip_verification_codes/${req.tripId}`)
		.get();

	if (!verCodeSnap.exists() || !verCodeSnap.val()) {
		throw new ExpectedError("Trip has no verification code", Reason.BAD_STATE);
	}

	if (verCodeSnap.val().expiresAt < Date.now()) {
		throw new ExpectedError("Trip verification code expired", Reason.BAD_STATE);
	}

	const token = verCodeSnap.val().code_token;

	try {
		verify(token, Buffer.from(req.verificationCode, "base64").toString());
	} catch (e) {
		throw new ExpectedError(
			"Invalid verification code",
			Reason.INVALID_ARGUMENT
		);
	}

	return {};
}

export default startTrip;
