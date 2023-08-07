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
	private readonly driverPath: [number, number][] | undefined;

	constructor(driverPath: [number, number][] | undefined) {
		this.driverPath = driverPath;
	}

	getOptimalRoute(
		currentDriverLocation: [number, number],
		riderPath: [number, number][],
		allowWalk = false,
	): Route | null {
		if (riderPath.length === 0) return null;

		if (this.driverPath === undefined || this.driverPath.length == 0) {
			const path = encode(riderPath);
			return {
				tripPath: riderPath,
				encodedTripPath: path,
				encodedNewDriverPath: path,
			};
		}

		const intersection = findIntersection(this.driverPath, riderPath);

		// If the paths don't overlap at all, then there is no optimal route
		if (intersection === null) return null;

		let newDriverPath = this.driverPath;
		const MAX_WALK_DISTANCE_METER = 150;

		let pickupWalk: Walk | undefined;
		let dropOffWalk: Walk | undefined;

		if (intersection.firstIndex > 0) {
			if (
				allowWalk ||
				haversine(riderPath[0], riderPath[intersection.firstIndex]) * 1000 >
					MAX_WALK_DISTANCE_METER ||
				this.checkVehicleCrossedPoint(
					currentDriverLocation,
					riderPath[intersection.firstIndex],
					this.driverPath,
				)
			) {
				return null;
			}

			const path = riderPath.slice(0, intersection.firstIndex + 1);
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
			riderPath[intersection.lastIndex].toString() ===
			this.driverPath[-1].toString()
		) {
			const path = riderPath.slice(intersection.lastIndex + 1);
			newDriverPath = this.driverPath.concat(path);
			tripPath = tripPath.concat(path);
		} else if (riderPath.length > intersection.lastIndex + 1) {
			if (
				!allowWalk ||
				haversine(riderPath[intersection.lastIndex], riderPath[-1]) * 1000 >
					MAX_WALK_DISTANCE_METER
			) {
				return null;
			}

			const path = riderPath.slice(intersection.lastIndex);
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
