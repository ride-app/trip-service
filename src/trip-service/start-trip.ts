import { Code, ConnectError, HandlerContext } from "@bufbuild/connect";
import { getDatabase } from "firebase-admin/database";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import jwt from "jsonwebtoken";

import {
	StartTripRequest,
	StartTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import { getTrip } from "../repositories/trip-repository.js";

const { verify } = jwt;

async function startTrip(
	req: StartTripRequest,
	context: HandlerContext
): Promise<StartTripResponse> {
	const uid = context.requestHeader.get("uid");
	const tripId = req.name.split("/").pop();

	if (!tripId) {
		throw new ConnectError("Invalid Argument", Code.InvalidArgument);
	}

	const trip = await getTrip(tripId);

	if (!trip) {
		throw new ConnectError("Trip not found", Code.NotFound);
	}

	if (trip.driver?.name.split("/").pop() !== uid) {
		throw new ConnectError("Unauthorized", Code.PermissionDenied);
	}

	const verCodeSnap = await getDatabase()
		.ref(`trip_verification_codes/${tripId}`)
		.get();

	if (!verCodeSnap.exists() || !verCodeSnap.val()) {
		throw new ConnectError(
			"Trip has no verification code",
			Code.FailedPrecondition
		);
	}

	if (verCodeSnap.val().expiresAt < Date.now()) {
		throw new ConnectError(
			"Trip verification code expired",
			Code.FailedPrecondition
		);
	}

	const token = verCodeSnap.val().codeToken;

	try {
		verify(token, Buffer.from(req.verificationCode, "base64").toString());
	} catch (e) {
		throw new ConnectError("Invalid verification code", Code.InvalidArgument);
	}

	await getFirestore().collection("trips").doc(tripId).update({
		status: "complete",
		endAt: FieldValue.serverTimestamp(),
	});

	return new StartTripResponse();
}

export default startTrip;
