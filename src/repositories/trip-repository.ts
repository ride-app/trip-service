import {
	FieldPath,
	FieldValue,
	GeoPoint,
	getFirestore,
} from "firebase-admin/firestore";
import { getAuth, UserRecord } from "firebase-admin/auth";
import { Timestamp } from "@bufbuild/protobuf";
import {
	Trip,
	Trip_Driver,
	Trip_Location,
	Trip_PaymentMethod,
	Trip_Rider,
	Trip_Route,
	Trip_Status,
	Trip_Type,
	Trip_Vehicle,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";

import { PhoneNumber } from "../gen/google/type/phone_number_pb.js";
import { LatLng } from "../gen/google/type/latlng_pb.js";
import { Vehicle_Type } from "../gen/ride/driver/v1alpha1/driver_service_pb.js";
import { Code, ConnectError } from "@bufbuild/connect";

async function getTrip(tripId: string): Promise<Trip | undefined> {
	const snapshot = await getFirestore().collection("trips").doc(tripId).get();

	if (!snapshot.exists) {
		return undefined;
	}

	const riderUserRecord = await getAuth().getUser(
		snapshot.get("rider.uid") as string,
	);

	const hasDriver = snapshot.get("driver.uid") !== undefined;
	let driverUserRecord: UserRecord | undefined;

	if (hasDriver) {
		driverUserRecord = await getAuth().getUser(
			snapshot.get("driver.uid") as string,
		);
	}

	const trip = new Trip({
		name: `trips/${snapshot.id}`,
		createTime: Timestamp.fromDate(snapshot.createTime!.toDate()),
		updateTime: Timestamp.fromDate(snapshot.updateTime!.toDate()),
		type: Trip_Type[snapshot.get("type") as string as keyof typeof Trip_Type],
		status:
			Trip_Status[snapshot.get("status") as string as keyof typeof Trip_Status],
		vehicleType:
			Vehicle_Type[
				snapshot.get("vehicleType") as string as keyof typeof Vehicle_Type
			],
		rider: new Trip_Rider({
			name: `users/${snapshot.get("rider.uid")}`,
			displayName: riderUserRecord.displayName!,
			phoneNumber: new PhoneNumber({
				extension: riderUserRecord.phoneNumber,
			}),
		}),
		route: new Trip_Route({
			pickup: new Trip_Location({
				coordinates: new LatLng({
					latitude: (snapshot.get("pickup.location") as GeoPoint).latitude,
					longitude: (snapshot.get("pickup.location") as GeoPoint).longitude,
				}),
				address: snapshot.get("pickup.address") as string,
			}),
			dropOff: new Trip_Location({
				coordinates: new LatLng({
					latitude: (snapshot.get("dropOff.location") as GeoPoint).latitude,
					longitude: (snapshot.get("dropOff.location") as GeoPoint).longitude,
				}),
			}),
			// TODO: add the walks
		}),
		passengers: snapshot.get("passengers") as number,
		// overviewPolyline: snapshot.get("polyline"),
		paymentMethod:
			Trip_PaymentMethod[
				snapshot.get(
					"paymentMethod",
				) as string as keyof typeof Trip_PaymentMethod
			],
	});

	if (hasDriver) {
		trip.driver = new Trip_Driver({
			name: `drivers/${snapshot.get("driver.uid")}`,
			displayName: driverUserRecord!.displayName!,
			photoUri: driverUserRecord!.photoURL!,
			phoneNumber: driverUserRecord!.phoneNumber!,
		});
	}

	if (snapshot.get("vehicle")) {
		trip.vehicle = new Trip_Vehicle({
			description: "Toto",
			licensePlate: snapshot.get("vehicle.regNo") as string,
		});
	}

	return trip;
}

async function createTrip(
	trip: Trip,
): Promise<{ tripId: string; createTime: Date }> {
	console.info("writing trip to firestore...");

	try {
		const write = await getFirestore()
			.collection("trips")
			.add({
				status: Trip_Status[Trip_Status.PENDING],
				createdAt: FieldValue.serverTimestamp(),
				type: Trip_Type[trip.type],
				vehicleType: trip.vehicleType.toString().toLowerCase(),
				passengers: trip.passengers,
				route: {
					walk_to_pickup: trip.route?.walkToPickup
						? {
								location: new GeoPoint(
									trip.route.walkToPickup.coordinates!.latitude,
									trip.route.walkToPickup.coordinates!.longitude,
								),
								address: trip.route.walkToPickup.address,
								polylineString: trip.route.walkToPickup.polylineString,
						  }
						: undefined,
					pickup: {
						location: new GeoPoint(
							trip.route!.pickup!.coordinates!.latitude,
							trip.route!.pickup!.coordinates!.longitude,
						),
						address: trip.route!.pickup!.address,
						polylineString: trip.route!.pickup!.polylineString,
					},
					dropOff: {
						location: new GeoPoint(
							trip.route!.dropOff!.coordinates!.latitude,
							trip.route!.dropOff!.coordinates!.longitude,
						),
						address: trip.route!.dropOff!.address,
						polylineString: trip.route!.dropOff!.polylineString,
					},
					walk_to_destination: trip.route?.walkToDestination
						? {
								location: new GeoPoint(
									trip.route.walkToDestination.coordinates!.latitude,
									trip.route.walkToDestination.coordinates!.longitude,
								),
								address: trip.route.walkToDestination.address,
								polylineString: trip.route.walkToDestination.polylineString,
						  }
						: undefined,
				},
				// Re-evaluate redundant information's need
				rider: {
					uid: trip.rider?.name.split("/").pop(),
					notificationToken: (
						await getFirestore()
							.collection("users")
							.where(
								FieldPath.documentId(),
								"==",
								trip.rider?.name.split("/").pop(),
							)
							.select("token")
							.get()
					).docs[0]!.data()["token"] as string,
				},
			});

		console.info("trip written to firestore");

		return {
			tripId: write.id,
			createTime: (await write.get()).createTime!.toDate(),
		};
	} catch (error) {
		console.error(error);
		throw new ConnectError(
			"Something went wrong. Please try again later.",
			Code.Internal,
		);
	}
}

async function updateTrip(trip: Trip) {
	await getFirestore()
		.collection("trips")
		.doc(trip.name.split("/").pop()!)
		.update({
			status: Trip_Status[trip.status],
			driver: trip.driver
				? {
						uid: trip.driver.name.split("/").pop(),
						notificationToken: (
							await getFirestore()
								.collection("users")
								.where(
									FieldPath.documentId(),
									"==",
									trip.driver.name.split("/").pop(),
								)
								.select("token")
								.get()
						).docs[0]!.data()["token"] as string,
				  }
				: undefined,
			vehicle: trip.vehicle
				? {
						id: trip.vehicle.name.split("/").pop(),
						licensePlate: trip.vehicle.licensePlate,
				  }
				: undefined,
			route: {
				walk_to_pickup: trip.route?.walkToPickup
					? {
							location: new GeoPoint(
								trip.route.walkToPickup.coordinates!.latitude,
								trip.route.walkToPickup.coordinates!.longitude,
							),
							address: trip.route.walkToPickup.address,
							polylineString: trip.route.walkToPickup.polylineString,
					  }
					: undefined,
				pickup: {
					location: new GeoPoint(
						trip.route!.pickup!.coordinates!.latitude,
						trip.route!.pickup!.coordinates!.longitude,
					),
					address: trip.route!.pickup!.address,
					polylineString: trip.route!.pickup!.polylineString,
				},
				dropOff: {
					location: new GeoPoint(
						trip.route!.dropOff!.coordinates!.latitude,
						trip.route!.dropOff!.coordinates!.longitude,
					),
					address: trip.route!.dropOff!.address,
					polylineString: trip.route!.dropOff!.polylineString,
				},
				walk_to_destination: trip.route?.walkToDestination
					? {
							location: new GeoPoint(
								trip.route.walkToDestination.coordinates!.latitude,
								trip.route.walkToDestination.coordinates!.longitude,
							),
							address: trip.route.walkToDestination.address,
							polylineString: trip.route.walkToDestination.polylineString,
					  }
					: undefined,
			},
			paymentMethod: Trip_PaymentMethod[trip.paymentMethod],
		});
}

export { getTrip, createTrip, updateTrip };
