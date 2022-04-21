import { TripType, TripTypes } from './trip-type';

interface TripLocation {
	location: [number, number];
	address?: string;
}

class TripRequest {
	readonly locations: TripLocation[];

	// readonly addresses: string[];

	readonly vehicleType: string;

	readonly tripType!: TripType;

	readonly passengers: number;

	polyline: string;

	blackList: Set<string>;

	constructor(
		locations: TripLocation[],
		// addresses: string[],
		vehicleType: string,
		passengers: number,
		polyline: string,
		tripType: TripType,
		blackList: string[]
	) {
		this.locations = locations;
		this.vehicleType = vehicleType;
		this.tripType = tripType;
		this.passengers = passengers;
		this.polyline = polyline;
		this.blackList = new Set(blackList);
	}

	get pickup() {
		return this.locations[0];
	}

	get dropOff() {
		return this.locations.at(-1)!;
	}

	get pickUpAddress() {
		return this.locations[0].address;
	}

	get dropOffAddress() {
		return this.locations.at(-1)?.address;
	}

	static fromJson(json: Record<string, unknown>): TripRequest {
		const locations = json.locations as TripLocation[];
		const vehicleType = json.vehicleType as string;
		const type = TripTypes.find((t) => t === (json.type as string));

		if (!type) {
			throw new Error('Invalid trip type');
		}

		const passengers = json.passengers as number;
		const polyline = json.polyline as string;
		const blackList = json.blackList ? (json.blackList as string[]) : [];
		return new TripRequest(
			locations,
			vehicleType,
			passengers,
			polyline,
			type,
			blackList
		);
	}
}

export { TripRequest, TripLocation };
