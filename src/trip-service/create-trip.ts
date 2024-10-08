import { Timestamp } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
	CreateTripRequest,
	CreateTripResponse,
	Trip_PaymentMethod,
	Trip_Type,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

import { DriverSearchService, type Driver } from "./driver-search-service.js";
import { Vehicle_Type } from "../gen/ride/driver/v1alpha1/driver_service_pb.js";
import type { Service } from "./service.js";
import { logDebug, logInfo } from "../utils/logger.js";

const createTrip = async (
	_service: Service,
	req: CreateTripRequest,
): Promise<CreateTripResponse> => {
	const { trip } = req;

	if (trip?.type === Trip_Type.UNSPECIFIED) {
		logInfo("Trip type not specified");
		throw new ConnectError("trip type not specified", Code.InvalidArgument);
	}

	if (trip?.vehicleType === Vehicle_Type.UNSPECIFIED) {
		logInfo("Vehicle type not specified");
		throw new ConnectError("vehicle type not specified", Code.InvalidArgument);
	}

	if (trip?.paymentMethod === Trip_PaymentMethod.UNSPECIFIED) {
		logInfo("Payment method not specified");
		throw new ConnectError(
			"payment method not specified",
			Code.InvalidArgument,
		);
	}

	if (
		!trip?.route?.pickup?.coordinates ||
		!trip.route.pickup.address ||
		!trip.route.pickup.polylineString
	) {
		logInfo("Invalid pickup");
		throw new ConnectError("invalid pickup", Code.InvalidArgument);
	}

	if (!trip.route.dropOff?.coordinates || !trip.route.dropOff.address) {
		logInfo("Invalid dropoff");
		throw new ConnectError("invalid dropoff", Code.InvalidArgument);
	}

	const MAX_SEARCH_RADIUS_KM = 2;

	logDebug(`max search radius: ${MAX_SEARCH_RADIUS_KM * 1000}m`);

	const { tripId, createTime } = await _service.tripRepository.createTrip(trip);
	logInfo(`trip created: ${tripId}`);

	trip.name = `trips/${tripId}`;
	trip.createTime = Timestamp.fromDate(createTime);
	trip.updateTime = Timestamp.fromDate(createTime);

	const driverSearchService = new DriverSearchService(
		0.125,
		req,
		_service.firestore,
	);

	let bestOption: Driver | undefined;

	/* eslint no-await-in-loop: "off" */
	// Keep querying the driver createTrip service until we find a driver
	while (
		driverSearchService.searchRadius <= MAX_SEARCH_RADIUS_KM &&
		!bestOption
	) {
		logDebug(
			`searching for driver within ${
				driverSearchService.searchRadius * 1000
			} meters`,
		);
		// Query the driver createTrip service for the best option
		const driver = await driverSearchService.findDriver();

		if (driver) {
			// get the driver from the result
			const { driverId } = driver;
			logInfo(`found driver ${driverId}`);

			// Fetch the driver's notification token
			const notificationToken =
				await _service.notificationTokenRepository.getNotificationToken(
					driverId,
				);

			if (notificationToken === undefined) {
				throw new ConnectError(
					"Driver notification token not found",
					Code.FailedPrecondition,
				);
			}

			// Send the driver trip offer
			const accepted = await _service.driverRepository.sendOffer(
				tripId,
				trip,
				driver,
				notificationToken,
			);
			logInfo(`sent trip request to driver ${driverId}`);

			if (accepted) {
				// if the driver accepted the trip request then set the temporary result as final
				// and break out of the createTrip loop
				bestOption = driver;
				logInfo(`driver ${driverId} accepted trip request`);
				break;
			} else {
				// if the driver rejects offer add driver to skip list
				driverSearchService.addToSkipList(driverId);
				logInfo(`driver ${driverId} rejected trip request`);
			}
		} else {
			// if query returns no result then multiply the search radius by 2 and try again
			driverSearchService.searchRadius *= 2;
			logInfo(
				`increasing search radius to ${driverSearchService.searchRadius}`,
			);
		}
	}

	// If we found a driver then update the trip request with the driver's data
	if (bestOption) {
		const { driverId } = bestOption;
		logInfo(`driver found: ${driverId}`);

		const driverWithVehicle =
			await _service.driverRepository.getDriverWithVehicle(driverId);
		logInfo(`driver with vehicle found: ${driverWithVehicle?.vehicle.name}`);

		if (!driverWithVehicle) {
			throw new ConnectError("Driver not found", Code.FailedPrecondition);
		}

		trip.driver = driverWithVehicle.driver;

		trip.vehicle = driverWithVehicle.vehicle;

		await _service.tripRepository.updateTrip(trip);
		logInfo("trip updated");

		await _service.driverRepository.updateDriverPath(
			driverId,
			bestOption.optimalRoute.encodedNewDriverPath,
		);
		logInfo("driver current path updated");

		logInfo("Successfully created trip");
		return new CreateTripResponse({ trip });
	}

	// If no driver was found then delete the trip request
	await _service.tripRepository.deleteTrip(tripId);
	logInfo("trip deleted");

	throw new ConnectError("No driver nearby", Code.FailedPrecondition);
};

export default createTrip;
