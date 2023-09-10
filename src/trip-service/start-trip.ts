import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { getDatabase } from "firebase-admin/database";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import jwt from "jsonwebtoken";

import {
	StartTripRequest,
	StartTripResponse,
	Trip_Status,
} from "../gen/ride/trip/v1alpha1/trip_service_pb";
import type { Service } from "./service";

const { verify } = jwt;

async function startTrip(
	_service: Service,
	req: StartTripRequest,
	context: HandlerContext,
): Promise<StartTripResponse> {
	// TODO: Remove ignores when type if fixed
	// trunk-ignore(eslint/@typescript-eslint/no-unsafe-member-access)
	// trunk-ignore(eslint/@typescript-eslint/no-unsafe-assignment)
	// trunk-ignore(eslint/@typescript-eslint/no-unsafe-call)
	const uid = context.requestHeader.get("uid");
	const tripId = req.name.split("/").pop();

	if (!tripId) {
		throw new ConnectError("Invalid Argument", Code.InvalidArgument);
	}

	const trip = await _service.tripRepository.getTrip(tripId);

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
			Code.FailedPrecondition,
		);
	}

	if (verCodeSnap.child("expiresAt").val() < Date.now()) {
		throw new ConnectError(
			"Trip verification code expired",
			Code.FailedPrecondition,
		);
	}

	const token = verCodeSnap.child("codeToken").val() as string;

	try {
		verify(token, Buffer.from(req.verificationCode, "base64").toString());
	} catch (e) {
		throw new ConnectError("Invalid verification code", Code.InvalidArgument);
	}

	await getFirestore().collection("trips").doc(tripId).update({
		status: Trip_Status[Trip_Status.ACTIVE],
		endAt: FieldValue.serverTimestamp(),
	});

	return new StartTripResponse();
}

export default startTrip;
