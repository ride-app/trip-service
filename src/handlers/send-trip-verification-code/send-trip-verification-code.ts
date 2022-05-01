import { getMessaging } from "firebase-admin/messaging";
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
		throw new ExpectedError("Unauthorized", Reason.INVALID_AUTH);
	}

	const ttlSeconds = 120;
	const code: number = Math.floor(Math.random() * 900000) + 100000;

	await getMessaging().send({
		token: notificationToken,
		notification: {
			title: "OTP for trip is ",
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

	return {
		token: sign(
			{ iat: Date.now() },
			Buffer.from(code.toString()).toString("base64"),
			{ algorithm: "HS256", expiresIn: ttlSeconds }
		),
	};
}

export default sendTripVerificationCode;
