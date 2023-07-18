import { Messaging } from "firebase-admin/messaging";
import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { NotificationService } from "@buf/ride_notification.bufbuild_connect-es/ride/notification/v1alpha1/notification_service_connect";
import { createConnectTransport } from "@bufbuild/connect-node";
import { createPromiseClient, type PromiseClient } from "@bufbuild/connect";
import type { Driver } from "../trip-service/driver-search-service.js";
import {
	Trip,
	Trip_Driver,
	Trip_Vehicle,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

export default class DriverRepository {
	readonly #firestore: FirebaseFirestore.Firestore;

	readonly #fcm: Messaging;

	readonly #notificationService: PromiseClient<typeof NotificationService>;

	constructor(firestore: FirebaseFirestore.Firestore, fcm: Messaging) {
		this.#notificationService = createPromiseClient(
			NotificationService,
			createConnectTransport({
				// Requests will be made to <baseUrl>/<package>.<service>/method
				baseUrl: "https://demo.connect.build",

				// You have to tell the Node.js http API which HTTP version to use.
				httpVersion: "2",

				// Interceptors apply to all calls running through this transport.
				interceptors: [],
			}),
		);

		this.#firestore = firestore;
		this.#fcm = fcm;
	}

	async sendNotification(notificationToken: string) {
		return this.#fcm.send({
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

	async sendOffer(tripId: string, trip: Trip, driver: Driver) {
		const driverRef = this.#firestore
			.collection("activeDrivers")
			.doc(driver.driverId);

		const tripRequestRef = driverRef.collection("tripOffers").doc(tripId);

		const expiresAt = Date.now() + 30000;
		let notificationToken: string | undefined;

		const offerSent = await this.#firestore.runTransaction(
			async (transaction) => {
				const driverData = await transaction.get(driverRef);

				if (
					!driverData.exists ||
					driverData.get("capacity") < trip.passengers
				) {
					return false;
				}

				notificationToken = driverData.get("notificationToken") as string;

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
							]),
						),
						new GeoPoint(
							...(driver.optimalRoute.tripPath[-1] ?? [
								trip.route?.pickup?.coordinates?.latitude,
								trip.route?.dropOff?.coordinates?.longitude,
							]),
						),
					],
				});

				return true;
			},
		);

		if (!offerSent) {
			return false;
		}

		try {
			if (notificationToken) await this.sendNotification(notificationToken);
		} catch (error) {
			console.error(error);
		}

		const timeout = setTimeout(() => {
			// trunk-ignore(eslint/@typescript-eslint/no-floating-promises)
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
			await driverRef.update({
				capacity: FieldValue.increment(trip.passengers),
			});
		}

		return accepted;
	}

	async getDriver(driverId: string): Promise<Trip_Driver | undefined> {
		const driverRef = this.#firestore.collection("activeDrivers").doc(driverId);

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

	async getDriverWithVehicle(driverId: string): Promise<
		| {
				driver: Trip_Driver;
				vehicle: Trip_Vehicle;
		  }
		| undefined
	> {
		const driverRef = this.#firestore.collection("activeDrivers").doc(driverId);

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
				licensePlate: driverData.get("licensePlate") as string,
				description: "E-Rickshaw",
			}),
		};
	}

	async updateDriverCurrentPath(driverId: string, currentPath: string) {
		return this.#firestore.collection("activeDrivers").doc(driverId).update({
			currentPath,
		});
	}
}

// export { sendOffer, getDriver, getDriverWithVehicle, updateDriverCurrentPath };
