import { getFirestore } from "firebase-admin/firestore";
import { Timestamp } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@bufbuild/connect";
import {
	CreateTripRequest,
	CreateTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import * as TripRepository from "../repositories/trip-repository.js";

import { DriverSearchService, Driver } from "./driver-search-service.js";
import {
	sendOffer,
	getDriverWithVehicle,
	updateDriverCurrentPath,
} from "../repositories/driver-repository.js";
import { haversine } from "../utils/distance.js";

const createTrip = async (
	req: CreateTripRequest,
): Promise<CreateTripResponse> => {
	const { trip } = req;

	if (
		!trip?.route?.pickup &&
		!trip?.route?.pickup?.coordinates &&
		!trip?.route?.pickup?.address &&
		!trip?.route?.pickup?.polylineString
	) {
		throw new ConnectError("Invalid Argument", Code.InvalidArgument);
	}

	if (
		!trip?.route?.dropOff &&
		!trip?.route?.dropOff?.coordinates &&
		!trip?.route?.dropOff?.address
	) {
		throw new ConnectError("Invalid Argument", Code.InvalidArgument);
	}

	const MAX_SEARCH_RADIUS = Math.min(
		2,
		haversine(
			[
				trip.route!.pickup.coordinates!.latitude,
				trip.route!.pickup.coordinates!.longitude,
			],
			[
				trip.route!.dropOff.coordinates!.latitude,
				trip.route!.dropOff.coordinates!.longitude,
			],
		) / 2,
	);
	const firestore = getFirestore();

	const { tripId, createTime } = await TripRepository.createTrip(trip);

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

			// Send the driver trip offer
			const accepted = await sendOffer(
				tripId,
				trip,
				driver,
				// driverData.get('notificationToken')
			);

			if (accepted) {
				// if the driver accepted the trip request then set the temporary result as final
				// and break out of the createTrip loop
				bestOption = driver;
				break;
			} else {
				// if the driver rejects offer add driver to skip list
				driverSearchService.addToSkipList(driverId);
			}
		} else {
			// if query returns no result then multiply the search radius by 2 and try again
			driverSearchService.searchRadius *= 2;
		}
	}

	// If we found a driver then update the trip request with the driver's data
	if (bestOption) {
		const { driverId } = bestOption;

		const driverWithVehicle = await getDriverWithVehicle(driverId);

		if (!driverWithVehicle) {
			throw new ConnectError("Driver not found", Code.FailedPrecondition);
		}

		trip.driver = driverWithVehicle.driver;

		trip.vehicle = driverWithVehicle.vehicle;

		await TripRepository.updateTrip(trip);

		await updateDriverCurrentPath(
			driverId,
			bestOption.optimalRoute.newVehiclePathPolyline,
		);

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

	throw new ConnectError("No driver found", Code.Unavailable);
};

export default createTrip;
