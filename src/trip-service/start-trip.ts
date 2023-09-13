import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { createHmac } from "node:crypto";
import { totp } from "otplib";

import {
	StartTripRequest,
	StartTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import type { Service } from "./service.js";

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

	const secret = process.env["OTP_SECRET"];

	if (!secret) {
		throw new ConnectError("something went wrong", Code.Internal);
	}

	const secretHmac = createHmac("sha256", secret).update(tripId);

	totp.options = {
		epoch: trip.createTime!.toDate().getUTCMilliseconds(),
		digits: 6,
		step: 120,
	};

	const valid = totp.verify({
		token: req.verificationCode,
		secret: secretHmac.digest("hex"),
	});

	if (!valid) {
		throw new ConnectError("Invalid verification code", Code.InvalidArgument);
	}

	try {
		await _service.tripRepository.startTrip(tripId);
	} catch (error) {
		throw new ConnectError("Something went wrong", Code.Internal);
	}

	return new StartTripResponse();
}

export default startTrip;
