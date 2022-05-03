import { getFirestore } from "firebase-admin/firestore";

interface Trip {
	tripId: string;
	type: string;
	createdAt: number;
	status: string;
	polyline?: string;
	driverUid?: string;
	riderUid: string;
	passengers: number;
	vehicle?: {
		id: string;
		license_number: string;
		type: string;
	};
	paymentMethod: string;
}

async function getTrip(tripId: string): Promise<Trip | undefined> {
	const snap = await getFirestore().collection("trips").doc(tripId).get();

	if (!snap.exists) {
		return undefined;
	}

	return {
		tripId: snap.id,
		createdAt: snap.createTime?.toMillis(),
		type: snap.get("type"),
		status: snap.get("status"),
		polyline: snap.get("polyline"),
		driverUid: snap.get("driver.id"),
		riderUid: snap.get("rider.id"),
		passengers: snap.get("passengers"),
		vehicle:
			snap.get("vehicle") !== undefined
				? {
						id: snap.get("vehicle.id"),
						license_number: snap.get("vehicle.regNo"),
						type: snap.get("vehicleType"),
				  }
				: undefined,
		paymentMethod: snap.get("paymentMethod"),
	} as Trip;
}

export default getTrip;
