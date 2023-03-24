import { getMessaging } from "firebase-admin/messaging";
import { FieldValue, GeoPoint, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Driver } from "../trip-service/driver-search-service.js";
import {
	Trip,
	Trip_Driver,
	Trip_Vehicle,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

// interface DriverData {
// 	vehicleId: string;
// 	vehicleNumber: string;
// 	notificationToken: string;
// 	capacity: number;
// }

async function sendNotification(notificationToken: string) {
	return getMessaging().send({
		token: notificationToken,
		notification: {
			title: "You have a new Ride request",
		},
		data: {
			click_action: "FLUTTER_NOTIFICATION_CLICK",
			sound: "default",
			icon: "default",
		},
		android: {
			ttl: 45,
			notification: {
				priority: "max",
				channelId: "new_ride",
				sound: "alert.mp3",
				vibrateTimingsMillis: [0, 1000, 3000, 1000, 3000, 1000],
				visibility: "public",
			},
		},
	});
}

async function sendOffer(tripId: string, trip: Trip, driver: Driver) {
	const driverRef = getFirestore()
		.collection("activeDrivers")
		.doc(driver.driverId);

	const tripRequestRef = driverRef.collection("tripOffers").doc(tripId);

	const expiresAt = Date.now() + 30000;
	let notificationToken: string | undefined;

	const offerSent = await getFirestore().runTransaction(async (transaction) => {
		const driverData = await transaction.get(driverRef);

		if (!driverData.exists || driverData.get("capacity") < trip.passengers) {
			return false;
		}

		notificationToken = driverData.get("notificationToken");

		transaction.update(driverRef, {
			capacity: FieldValue.increment(-trip.passengers),
		});

		transaction.set(tripRequestRef, {
			accepted: false,
			expiresAt,
			passengers: trip.passengers,
			polyline: driver.optimalRoute.newVehiclePathPolyline,
			locations: [
				// TODO: Don't forget about these null checks
				new GeoPoint(
					...(driver.optimalRoute.tripPath[0] ?? [
						trip.route?.pickup?.coordinates?.latitude,
						trip.route?.dropOff?.coordinates?.longitude,
					])
				),
				new GeoPoint(
					...(driver.optimalRoute.tripPath[-1] ?? [
						trip.route?.pickup?.coordinates?.latitude,
						trip.route?.dropOff?.coordinates?.longitude,
					])
				),
			],
		});

		return true;
	});

	if (!offerSent) {
		return false;
	}

	try {
		if (notificationToken) await sendNotification(notificationToken);
	} catch (error) {
		console.error(error);
	}

	const timeout = setTimeout(() => {
		tripRequestRef.delete();
	}, expiresAt - Date.now());

	const accepted: boolean = await new Promise<boolean>((ready) => {
		let initialReadComplete = false;

		const unsubscribe = driverRef
			.collection("tripOffers")
			.doc(tripId)
			.onSnapshot((snap) => {
				if (initialReadComplete) {
					if (!snap.data() && snap.get("accepted") === true) {
						unsubscribe();
						ready(true);
					} else {
						ready(false);
					}
				} else {
					initialReadComplete = true;
				}
			});
	});

	clearTimeout(timeout);

	if (!accepted) {
		driverRef.update({
			capacity: FieldValue.increment(trip.passengers),
		});
	}

	return accepted;
}

async function getDriver(driverId: string): Promise<Trip_Driver | undefined> {
	const driverRef = getFirestore().collection("activeDrivers").doc(driverId);

	const driverData = await driverRef.get();
	const driverAuthData = await getAuth().getUser(driverId);

	if (!driverData.exists || !driverData.data()) {
		return undefined;
	}

	return new Trip_Driver({
		name: `drivers/${driverId}`,
		displayName: driverAuthData.displayName!,
		photoUri: driverAuthData.photoURL!,
	});
}

async function getDriverWithVehicle(driverId: string): Promise<
	| {
			driver: Trip_Driver;
			vehicle: Trip_Vehicle;
	  }
	| undefined
> {
	const driverRef = getFirestore().collection("activeDrivers").doc(driverId);

	const driverData = await driverRef.get();
	const driverAuthData = await getAuth().getUser(driverId);

	if (!driverData.exists || !driverData.data()) {
		return undefined;
	}

	return {
		driver: new Trip_Driver({
			name: `drivers/${driverId}`,
			displayName: driverAuthData.displayName!,
			photoUri: driverAuthData.photoURL!,
		}),
		vehicle: new Trip_Vehicle({
			name: `vehicles/${driverData.get("vehicleId")}`,
			licensePlate: driverData.get("licensePlate"),
			description: "E-Rickshaw",
		}),
	};
}

export { sendOffer, getDriver, getDriverWithVehicle };
