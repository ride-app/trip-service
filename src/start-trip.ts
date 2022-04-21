import { Metadata } from '@grpc/grpc-js';
import { StartTripRequest } from './gen/ride/trip/v1alpha1/trip_service';

async function startTrip(
	req: StartTripRequest,
	metadata: Metadata
): Promise<void> {}

export default startTrip;
