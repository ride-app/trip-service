import { getMessaging } from "firebase-admin/messaging";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { createHmac } from "node:crypto";
import { TOTP } from "otpauth";
import {
	TripVerificationRequest,
	TripVerificationResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import type { Service } from "./service.js";

async function tripVerification(
	_service: Service,
	req: TripVerificationRequest,
	context: HandlerContext,
): Promise<TripVerificationResponse> {
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

	const notificationToken =
		await _service.notificationTokenRepository.getNotificationToken(
			uid as string,
		);

	if (!notificationToken) {
		throw new ConnectError(
			"User has no notification token",
			Code.FailedPrecondition,
		);
	}

	const secret = process.env["OTP_SECRET"];

	if (!secret) {
		throw new ConnectError("something went wrong", Code.Internal);
	}

	const secretHmac = createHmac("sha256", secret).update(tripId);

	const otpGenerator = new TOTP({
		algorithm: "SHA256",
		digits: 6,
		period: 120,
		secret: secretHmac.digest("hex"),
	});

	const otp = otpGenerator.generate({
		timestamp: trip.createTime!.toDate().getTime(),
	});

	await getMessaging().send({
		token: notificationToken,
		notification: {
			title: `OTP for trip is ${otp}`,
		},
		data: {
			click_action: "FLUTTER_NOTIFICATION_CLICK",
			sound: "default",
			icon: "default",
		},
		android: {
			ttl: 120 * 1000,
			notification: {
				priority: "max",
				// channelId: "new_ride",
				// sound: "alert.mp3",
				visibility: "public",
			},
		},
	});

	return new TripVerificationResponse();
}

export default tripVerification;
