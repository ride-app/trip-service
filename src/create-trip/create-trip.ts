import { getAuth } from "firebase-admin/auth";
import {
	getFirestore,
	FieldPath,
	FieldValue,
	GeoPoint,
} from "firebase-admin/firestore";
import {
	CreateTripRequest,
	CreateTripResponse,
} from "../gen/ride/trip/v1alpha1/trip_service";
import { VehicleType } from "../gen/ride/type/v1alpha1/types";
import * as AuthRepository from "../repositories/auth-repository";

import Vehicle from "../models/vehicle";
import { DriverSearchService } from "./services/driver-search-service";
import {
	sendOffer,
	getDriverDataIfCapacityAvailable,
} from "./services/driver-services";
import { ExpectedError, Reason } from "../utils/errors/expected-error";

const createTrip = async (
	tripRequest: CreateTripRequest,
	uid: string
): Promise<CreateTripResponse | undefined> => {
	if (
		tripRequest.origin === undefined ||
		!tripRequest.destination === undefined
	) {
		throw new ExpectedError("Invalid Argument", Reason.INVALID_ARGUMENT);
	}

	const user = await AuthRepository.getUser(uid);

	const MAX_SEARCH_RADIUS = 2;
	const firestore = getFirestore();

	// Persist the trip request
	const { id: tripId } = await firestore.collection("trips").add({
		status: "pending",
		createdAt: FieldValue.serverTimestamp(),
		type: tripRequest.tripType,
		vehicleType: tripRequest.vehicleType,
		passengers: tripRequest.passengers,
		locations: {
			origin: {
				location: new GeoPoint(
					tripRequest.origin!.coordinates.latitude,
					tripRequest.origin!.coordinates.longitude
				),
				address: tripRequest.origin!.address,
			},
			dropOff: {
				location: new GeoPoint(
					tripRequest.destination!.coordinates.latitude,
					tripRequest.destination!.coordinates.longitude
				),
				address: tripRequest.destination!.address,
			},
		},
		user: {
			uid: user.uid,
			name: user.displayName,
			phone: user.phoneNumber,
			photoUrl: user.photoURL,
			notificationToken: (
				await firestore
					.collection("users")
					.where(FieldPath.documentId(), "==", user.uid)
					.select("token")
					.get()
			).docs[0].data().token,
		},
	});

	// Initialize the driver createTrip service
	const driverSearchService = new DriverSearchService(0.5, tripRequest);

	let result: Awaited<ReturnType<typeof driverSearchService.getBestOption>>;

	/* eslint no-await-in-loop: "off" */
	// Keep querying the driver createTrip service until we find a driver
	while (driverSearchService.searchRadius <= MAX_SEARCH_RADIUS && !result) {
		// Query the driver createTrip service for the best option
		const tempResult = await driverSearchService.getBestOption();

		if (tempResult) {
			// get the driver from the result
			const { driver } = tempResult;

			// get the driver data if the driver has capacity to take the passengers
			const driverData = await getDriverDataIfCapacityAvailable(
				driver.id,
				tripRequest.passengers
			);

			if (driverData) {
				driver.notificationToken = driverData.notificationToken;

				// Send the driver trip offer
				const accepted = await sendOffer(
					tripId,
					tripRequest,
					tempResult
					// driverData.get('notificationToken')
				);

				if (accepted) {
					// Get driver's auth data from id
					const driverAuthData = await getAuth().getUser(driver.id);

					// Update driver's properties
					driver.vehicle = new Vehicle(
						driverData.vehicleId,
						driverData.vehicleNumber,
						tripRequest.vehicleType
					);
					driver.name = driverAuthData.displayName!;
					driver.phone = driverAuthData.phoneNumber!;
					driver.photoUrl = driverAuthData.photoURL!;

					// if the driver accepted the trip request then set the temporary result as final
					// and break out of the createTrip loop
					result = tempResult;
					break;
				} else {
					// if the driver rejects offer add driver to skip list
					driverSearchService.addToSkipList(driver.id);
				}
			} else {
				// if the driver has no capacity to take the passengers add driver to skip list
				driverSearchService.addToSkipList(driver.id);
			}
		} else {
			// if query returns no result then multiply the createTrip radius by 2 and try again
			driverSearchService.searchRadius *= 2;
		}
	}

	// If we found a driver then update the trip request with the driver's data
	if (result) {
		const { driver } = result;

		await firestore.runTransaction(async (transaction) => {
			const locationRef = firestore
				.collection(VehicleType[tripRequest.vehicleType].toLowerCase())
				.doc(driver.id);

			// FIX: use tripOffers and activeTrips collections
			const tripOfferRef = firestore
				.collection("activeDrivers")
				.doc(driver.id)
				.collection("tripOffers")
				.doc(tripId);

			const activeTripsRef = firestore
				.collection("activeDrivers")
				.doc(driver.id)
				.collection("activeTrips")
				.doc(tripId);

			const tripRef = firestore.collection("trips").doc(tripId);

			transaction.update(locationRef, {
				currentPathString: result!.optimalRoute.newVehiclePathPolyline,
			});

			transaction.delete(
				tripOfferRef
				// {
				// 	expiresAt: FieldValue.delete(),
				// 	polyline: FieldValue.delete(),
				// 	locations: FieldValue.delete(),
				// },
				// { merge: true }
			);

			transaction.set(activeTripsRef, {
				ref: tripRef,
			});

			transaction.update(tripRef, {
				status: "accepted",
				driver: {
					id: driver.id,
					name: driver.name,
					phone: driver.phone,
					photoUrl: driver.photoUrl,
				},
				vehicle: {
					id: driver.vehicle?.id,
					regNo: driver.vehicle?.regNumber,
				},
				walks: {
					origin:
						result!.optimalRoute.pickupWalk !== undefined
							? {
									distance: result?.optimalRoute.pickupWalk.length,
									polyline: result?.optimalRoute.pickupWalk.polyline,
							  }
							: null,
					dropOff:
						result!.optimalRoute.dropOffWalk !== undefined
							? {
									distance: result?.optimalRoute.dropOffWalk.length,
									polyline: result?.optimalRoute.dropOffWalk.polyline,
							  }
							: null,
				},
			});
		});

		return { tripId };
	}

	// If no driver was found then delete the trip request
	await firestore.collection("trips").doc(tripId).delete();

	return undefined;
};

export default createTrip;
