import {
	GetTripRequest,
	GetTripResponse,
} from './gen/ride/trip/v1alpha1/trip_service';
import { Vehicle } from './gen/ride/trip/v1alpha1/types';
import { VehicleType } from './gen/ride/type/v1alpha1/types';

import getTripFromRepo from './repositories/trip-repository';
import { ExpectedError, Reason } from './utils/errors/expected-error';
import getPersonFromUid from './utils/get-person-from-uid';

async function getTrip(
	req: GetTripRequest,
	uid: string
): Promise<GetTripResponse> {
	try {
		const trip = await getTripFromRepo(req.tripId);

		if (!trip) {
			throw new ExpectedError('Trip not found', Reason.NOT_FOUND);
		}

		if (trip.riderUid !== uid || trip.driverUid !== uid) {
			throw new ExpectedError('Unauthorized', Reason.INVALID_AUTH);
		}

		const vehicle = trip.vehicle
			? Vehicle.create({
					vehicleId: trip.vehicle?.id,
					licenseNumber: trip.vehicle?.license_number,
			  })
			: undefined;

		return {
			trip: {
				tripId: req.tripId,
				// status:,
				overviewPolyline: trip.polyline,
				passengers: trip.passengers,
				rider: await getPersonFromUid(trip.riderUid),
				driver: await getPersonFromUid(trip.driverUid),
				vehicle,
				vehicleType: VehicleType.E_RICKSHAW,
			},
		};
	} catch (err) {
		console.error(err);
		throw new ExpectedError('Internal server error', Reason.INTERNAL);
	}
}

export default getTrip;
