import { getFirestore } from "firebase-admin/firestore";
import { Timestamp } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@bufbuild/connect";
import {
	CreateTripRequest,
	CreateTripResponse,
	Trip_PaymentMethod,
	Trip_Type,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import * as TripRepository from "../repositories/trip-repository.js";

import { DriverSearchService, type Driver } from "./driver-search-service.js";
import { haversine } from "../utils/distance.js";
import { Vehicle_Type } from "../gen/ride/driver/v1alpha1/driver_service_pb.js";
import type { Service } from "./service.js";

const createTrip = async (
	_service: Service,
	req: CreateTripRequest,
): Promise<CreateTripResponse> => {
	const { trip } = req;

	if (trip?.type === Trip_Type.UNSPECIFIED) {
		console.info("trip type not specified");
		throw new ConnectError("trip type not specified", Code.InvalidArgument);
	}

	if (trip?.vehicleType === Vehicle_Type.UNSPECIFIED) {
		console.info("vehicle type not specified");
		throw new ConnectError("vehicle type not specified", Code.InvalidArgument);
	}

	if (trip?.paymentMethod === Trip_PaymentMethod.UNSPECIFIED) {
		console.info("payment method not specified");
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
		console.info("invalid pickup");
		throw new ConnectError("invalid pickup", Code.InvalidArgument);
	}

	if (!trip.route.dropOff?.coordinates || !trip.route.dropOff.address) {
		console.info("invalid dropoff");
		throw new ConnectError("invalid dropoff", Code.InvalidArgument);
	}

	const MAX_SEARCH_RADIUS = Math.min(
		2,
		haversine(
			[
				trip.route.pickup.coordinates.latitude,
				trip.route.pickup.coordinates.longitude,
			],
			[
				trip.route.dropOff.coordinates.latitude,
				trip.route.dropOff.coordinates.longitude,
			],
		) / 2,
	);

	console.info(`max search radius: ${MAX_SEARCH_RADIUS}`);

	const firestore = getFirestore();

	const { tripId, createTime } = await TripRepository.createTrip(trip);
	console.info(`trip created: ${tripId}`);

	trip.name = `trips/${tripId}`;
	trip.createTime = Timestamp.fromDate(createTime);
	trip.updateTime = Timestamp.fromDate(createTime);

	const driverSearchService = new DriverSearchService(0.5, req);

	let bestOption: Driver | undefined;

	/* eslint no-await-in-loop: "off" */
	// Keep querying the driver createTrip service until we find a driver
	while (driverSearchService.searchRadius <= MAX_SEARCH_RADIUS && !bestOption) {
		// Query the driver createTrip service for the best option
		const driver = await driverSearchService.findDriver();

		if (driver) {
			// get the driver from the result
			const { driverId } = driver;
			console.info(`found driver ${driverId}`);

			// Send the driver trip offer
			const accepted = await _service.driverRepository.sendOffer(
				tripId,
				trip,
				driver,
				// driverData.get('notificationToken')
			);
			console.info(`sent trip request to driver ${driverId}`);

			if (accepted) {
				// if the driver accepted the trip request then set the temporary result as final
				// and break out of the createTrip loop
				bestOption = driver;
				console.info(`driver ${driverId} accepted trip request`);
				break;
			} else {
				// if the driver rejects offer add driver to skip list
				driverSearchService.addToSkipList(driverId);
				console.info(`driver ${driverId} rejected trip request`);
			}
		} else {
			// if query returns no result then multiply the search radius by 2 and try again
			driverSearchService.searchRadius *= 2;
			console.info(
				`increasing search radius to ${driverSearchService.searchRadius}`,
			);
		}
	}

	// If we found a driver then update the trip request with the driver's data
	if (bestOption) {
		const { driverId } = bestOption;
		console.info(`driver found: ${driverId}`);

		const driverWithVehicle =
			await _service.driverRepository.getDriverWithVehicle(driverId);
		console.info(
			`driver with vehicle found: ${driverWithVehicle?.vehicle.name}`,
		);

		if (!driverWithVehicle) {
			throw new ConnectError("Driver not found", Code.FailedPrecondition);
		}

		trip.driver = driverWithVehicle.driver;

		trip.vehicle = driverWithVehicle.vehicle;

		await TripRepository.updateTrip(trip);
		console.info("trip updated");

		await _service.driverRepository.updateDriverCurrentPath(
			driverId,
			bestOption.optimalRoute.newVehiclePathPolyline,
		);
		console.info("driver current path updated");

		// await firestore.runTransaction(async (transaction) => {
		// 	const driverRef = firestore
		// 		.collection(trip.vehicleType.toLowerCase())
		// 		.doc(driverId);

		// 	// const tripRef = firestore.collection("trips").doc(tripId);

		// 	transaction.update(driverRef, {
		// 		currentPathString: bestOption!.optimalRoute.newVehiclePathPolyline,
		// 	});

		// 	// transaction.update(tripRef, {
		// 	// 	status: "accepted",
		// 	// 	driver: {
		// 	// 		id: driverId,
		// 	// 		name: trip.driver!.displayName,
		// 	// 		phone: trip.driver!.phoneNumber,
		// 	// 		photoUrl: trip.driver!.photoUri,
		// 	// 	},
		// 	// 	vehicle: {
		// 	// 		id: trip.vehicle?.name.split("/").pop(),
		// 	// 		licensePlate: trip.vehicle?.licensePlate,
		// 	// 	},
		// 	// 	walks: {
		// 	// 		origin:
		// 	// 			bestOption!.optimalRoute.pickupWalk !== undefined
		// 	// 				? {
		// 	// 						distance: bestOption?.optimalRoute.pickupWalk.length,
		// 	// 						polyline: bestOption?.optimalRoute.pickupWalk.polyline,
		// 	// 				  }
		// 	// 				: null,
		// 	// 		dropOff:
		// 	// 			bestOption!.optimalRoute.dropOffWalk !== undefined
		// 	// 				? {
		// 	// 						distance: bestOption?.optimalRoute.dropOffWalk.length,
		// 	// 						polyline: bestOption?.optimalRoute.dropOffWalk.polyline,
		// 	// 				  }
		// 	// 				: null,
		// 	// 	},
		// 	// });
		// });

		// return { trip };
		return new CreateTripResponse({ trip });
	}

	// If no driver was found then delete the trip request
	await firestore.collection("trips").doc(tripId).delete();
	console.info("trip deleted");

	throw new ConnectError("No driver found", Code.FailedPrecondition);
};

export default createTrip;
