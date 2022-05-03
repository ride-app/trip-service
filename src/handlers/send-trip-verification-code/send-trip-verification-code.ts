import { getMessaging } from "firebase-admin/messaging";
import { getDatabase } from "firebase-admin/database";
import { sign } from "jsonwebtoken";
import {
	SendTripVerificationCodeRequest,
	SendTripVerificationCodeResponse,
} from "../../gen/ride/trip/v1alpha1/trip_service";
import getTrip from "../../repositories/trip-repository";
import { ExpectedError, Reason } from "../../utils/errors/expected-error";

async function sendTripVerificationCode(
	req: SendTripVerificationCodeRequest,
	uid: string
): Promise<SendTripVerificationCodeResponse> {
	const trip = await getTrip(req.tripId);

	if (!trip) {
		throw new ExpectedError("Trip not found", Reason.NOT_FOUND);
	}

	if (trip.driverUid !== uid) {
		throw new ExpectedError("Unauthorized", Reason.UNAUTHORIZED);
	}

	const notificationTokenSnap = await getDatabase()
		.ref(`notification_tokens/${trip.riderUid}/notificationToken`)
		.get();

	if (
		!notificationTokenSnap.exists() ||
		notificationTokenSnap.val() === undefined
	) {
		throw new ExpectedError("User has no notification token", Reason.BAD_STATE);
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
		.ref(`trip_verification_codes/${trip.tripId}`)
		.set({ code_token: token, expiresAt: createdAt + ttlSeconds * 1000 });

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

	return {};
}

export default sendTripVerificationCode;
