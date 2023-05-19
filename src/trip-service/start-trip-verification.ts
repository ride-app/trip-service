import { getMessaging } from "firebase-admin/messaging";
import { getDatabase } from "firebase-admin/database";
import { Code, ConnectError, HandlerContext } from "@bufbuild/connect";
import pkg from "jsonwebtoken";
const { sign } = pkg;
import {
	StartTripVerificationRequest,
	StartTripVerificationResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import { getTrip } from "../repositories/trip-repository.js";

async function sendTripVerificationCode(
	req: StartTripVerificationRequest,
	context: HandlerContext
): Promise<StartTripVerificationResponse> {
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

	const notificationTokenSnap = await getDatabase()
		.ref(
			`notification_tokens/${trip.rider?.name
				.split("/")
				.pop()}/notificationToken`
		)
		.get();

	if (
		!notificationTokenSnap.exists() ||
		notificationTokenSnap.val() === undefined
	) {
		throw new ConnectError(
			"User has no notification token",
			Code.FailedPrecondition
		);
	}

	const notificationToken: string = notificationTokenSnap.val();

	const ttlSeconds = 120;
	const code: number = Math.floor(Math.random() * 900000) + 100000;
	const createdAt = Date.now();
	const token = sign(
		{ iat: Date.now() },
		Buffer.from(code.toString()).toString("base64"),
		{ algorithm: "HS256", expiresIn: ttlSeconds }
	);

	await getDatabase()
		.ref(`trip_verification_codes/${tripId}`)
		.set({ codeToken: token, expiresAt: createdAt + ttlSeconds * 1000 });

	await getMessaging().send({
		token: notificationToken,
		notification: {
			title: `OTP for trip is ${code}`,
		},
		data: {
			click_action: "FLUTTER_NOTIFICATION_CLICK",
			sound: "default",
			icon: "default",
		},
		android: {
			ttl: ttlSeconds,
			notification: {
				priority: "max",
				// channelId: "new_ride",
				// sound: "alert.mp3",
				visibility: "public",
			},
		},
	});

	return new StartTripVerificationResponse();
}

export default sendTripVerificationCode;
