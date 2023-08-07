import {
	distanceToPathSegment,
	haversine,
	pathLength,
} from "../utils/distance";
import {
	findIntersection,
	indexOfPointOnPath,
	type Polyline,
} from "../utils/paths";
import { encode } from "@googlemaps/polyline-codec";

export interface Walk {
	path: [number, number][];
	polyline: string;
	length: number;
}

export interface Route {
	pickupWalk?: Walk;
	dropOffWalk?: Walk;
	tripPath: [number, number][];
	encodedTripPath: Polyline;
	encodedNewDriverPath: Polyline;
}

export class RouteGenerator {
	// private readonly driverPath: [number, number][] | undefined;
	private readonly riderPath: [number, number][];

	constructor(riderPath: [number, number][]) {
		if (riderPath.length === 0) {
			throw new Error("Rider path must not be empty");
		}
		this.riderPath = riderPath;
	}

	getOptimalRoute(
		currentDriverLocation: [number, number],
		driverPath: [number, number][] | undefined,
		allowWalk = false,
	): Route | null {
		if (driverPath === undefined || driverPath.length == 0) {
			const path = encode(this.riderPath);
			return {
				tripPath: this.riderPath,
				encodedTripPath: path,
				encodedNewDriverPath: path,
			};
		}

		const intersection = findIntersection(driverPath, this.riderPath);

		// If the paths don't overlap at all, then there is no optimal route
		if (intersection === null) return null;

		let newDriverPath = driverPath;
		const MAX_WALK_DISTANCE_METER = 150;

		let pickupWalk: Walk | undefined;
		let dropOffWalk: Walk | undefined;

		if (intersection.firstIndex > 0) {
			if (
				allowWalk ||
				haversine(this.riderPath[0], this.riderPath[intersection.firstIndex]) *
					1000 >
					MAX_WALK_DISTANCE_METER ||
				this.checkVehicleCrossedPoint(
					currentDriverLocation,
					this.riderPath[intersection.firstIndex],
					driverPath,
				)
			) {
				return null;
			}

			const path = this.riderPath.slice(0, intersection.firstIndex + 1);
			const length = pathLength(path);

			if (length > MAX_WALK_DISTANCE_METER) {
				return null;
			}

			pickupWalk = {
				path,
				polyline: encode(path),
				length,
			};
		}

		let tripPath = intersection.points;

		if (
			this.riderPath[intersection.lastIndex].toString() ===
			driverPath[-1].toString()
		) {
			const path = this.riderPath.slice(intersection.lastIndex + 1);
			newDriverPath = driverPath.concat(path);
			tripPath = tripPath.concat(path);
		} else if (this.riderPath.length > intersection.lastIndex + 1) {
			if (
				!allowWalk ||
				haversine(this.riderPath[intersection.lastIndex], this.riderPath[-1]) *
					1000 >
					MAX_WALK_DISTANCE_METER
			) {
				return null;
			}

			const path = this.riderPath.slice(intersection.lastIndex);
			const length = pathLength(path);

			if (length > MAX_WALK_DISTANCE_METER) {
				return null;
			}

			dropOffWalk = {
				path,
				polyline: encode(path),
				length,
			};
		}

		return {
			pickupWalk,
			dropOffWalk,
			tripPath,
			encodedTripPath: encode(tripPath),
			encodedNewDriverPath: encode(newDriverPath),
		};
	}

	private checkVehicleCrossedPoint(
		location: [number, number],
		point: [number, number],
		path: [number, number][],
	): boolean {
		let edgeStartPoint: number = path.length - 2;
		let shortestDistance = Infinity;
		const indexOfPoint: number = indexOfPointOnPath(point, path);

		for (let i = 0; i < path.length - 1; i += 1) {
			const distanceRes = distanceToPathSegment(location, path[i], path[i + 1]);
			if (distanceRes.distance < shortestDistance) {
				edgeStartPoint = i;
				if (edgeStartPoint > indexOfPoint) return true;
				shortestDistance = distanceRes.distance;
			}
		}

		return false;
	}
}
