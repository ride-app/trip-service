import { GeoCollectionReference, initializeApp } from 'geofirestore';
import { encode, decode, LatLngTuple } from '@googlemaps/polyline-codec';
import { GeoPoint, getFirestore } from 'firebase-admin/firestore';

import ScoreVector from '../models/score-vector';
import Driver from '../models/driver';
import { CreateTripRequest } from '../../gen/ride/trip/v1alpha1/trip_service';
import MinHeap from '../utils/min-heap';
import {
	haversine,
	pathLength,
	distanceToPathSegment,
} from '../utils/distance';

import { findIntersection, indexOfPointOnPath } from '../utils/paths';
import { TripType, VehicleType } from '../../gen/ride/trip/v1alpha1/types';

interface Option {
	driver: Driver;
	optimalRoute: NonNullable<ReturnType<typeof getOptimalRoute>>;
}

interface CachedOption {
	driver: Driver;
	optimalRoute: ReturnType<typeof getOptimalRoute>;
}

interface Walk {
	path: LatLngTuple[];
	polyline: string;
	length: number;
}

function checkVehicleCrossedPoint(
	location: LatLngTuple,
	point: LatLngTuple,
	path: LatLngTuple[]
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

function getOptimalRoute(
	location: LatLngTuple,
	currentPath: LatLngTuple[] | undefined,
	overlayPath: LatLngTuple[],
	allowWalk = false
): {
	pickupWalk?: Walk;
	dropOffWalk?: Walk;
	tripPath: LatLngTuple[];
	tripPathPolyline: string;
	newVehiclePathPolyline: string;
} | null {
	if (overlayPath.length === 0) return null;
	// If there is no current path, then overlayPath is the optimal path
	if (currentPath === undefined || currentPath.length === 0) {
		const path = encode(overlayPath);
		return {
			tripPath: overlayPath,
			tripPathPolyline: path,
			newVehiclePathPolyline: path,
		};
	}

	const intersection = findIntersection(currentPath, overlayPath);

	// If the paths don't overlap at all, then there is no optimal route
	if (intersection === null) return null;

	let newVehiclePath = currentPath;
	const MAX_WALK_DISTANCE_METER = 150;

	let pickupWalk: Walk | undefined;
	let dropOffWalk: Walk | undefined;

	if (intersection.firstIndex > 0) {
		if (
			allowWalk ||
			haversine(overlayPath[0], overlayPath[intersection.firstIndex]) * 1000 >
				MAX_WALK_DISTANCE_METER ||
			checkVehicleCrossedPoint(
				location,
				overlayPath[intersection.firstIndex],
				currentPath
			)
		) {
			return null;
		}

		const path = overlayPath.slice(0, intersection.firstIndex + 1);
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
		overlayPath[intersection.lastIndex].toString() ===
		currentPath[-1].toString()
	) {
		const path = overlayPath.slice(intersection.lastIndex + 1);
		newVehiclePath = currentPath.concat(path);
		tripPath = tripPath.concat(path);
	} else if (overlayPath.length > intersection.lastIndex + 1) {
		if (
			allowWalk === false ||
			haversine(overlayPath[intersection.lastIndex], overlayPath[-1]) * 1000 >
				MAX_WALK_DISTANCE_METER
		) {
			return null;
		}

		const path = overlayPath.slice(intersection.lastIndex);
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
		tripPathPolyline: encode(tripPath),
		newVehiclePathPolyline: encode(newVehiclePath),
	};
}

class DriverSearchService {
	readonly tripRequest: CreateTripRequest;

	searchRadius: number;

	private allOptionsCache: Record<string, CachedOption> = {};

	private skipList: Set<string> = new Set([]);

	private path: LatLngTuple[];

	private geoCollection: GeoCollectionReference;

	constructor(searchRadius: number, tripRequest: CreateTripRequest) {
		this.tripRequest = tripRequest;
		this.path = decode(tripRequest.overviewPolyline);
		this.geoCollection = initializeApp(getFirestore()).collection(
			VehicleType[tripRequest.vehicleType].toLowerCase()
		);
		this.searchRadius = searchRadius;
		this.skipList = new Set(this.tripRequest.skipList);
	}

	addToSkipList(id: string) {
		this.skipList.add(id);
	}

	async getBestOption(): Promise<Option | undefined> {
		const optionScores: MinHeap<{ id: string; scoreVector: ScoreVector }> =
			new MinHeap((n) => n.scoreVector.length);

		/// Get nearest Vehicles
		const results = await this.queryArea();

		Object.keys(results).forEach((id) => {
			const result = results[id];
			const cachedOption = this.allOptionsCache[id];

			if (
				cachedOption === undefined ||
				cachedOption.driver.currentPathString !== result.currentPathString ||
				cachedOption.driver.location.toString() !== result.coords.toString()
			) {
				const driver = new Driver(
					id,
					result.coords,
					result.distance,
					result.currentPathString
				);
				const optimalRoute = getOptimalRoute(
					driver.location,
					driver.currentPathString
						? decode(driver.currentPathString)
						: undefined,
					this.path,
					this.tripRequest.tripType === TripType.SHARED
				);

				this.allOptionsCache[id] = {
					driver,
					optimalRoute,
				};
			}

			const currentOption = this.allOptionsCache[id];

			if (currentOption.optimalRoute !== null) {
				optionScores.push({
					id,
					scoreVector: new ScoreVector(
						currentOption.driver.distance,
						(currentOption.optimalRoute.pickupWalk?.length ?? 0) +
							(currentOption.optimalRoute.dropOffWalk?.length ?? 0)
					),
				});
			}
		});

		const bestScore = optionScores.pop();

		return bestScore !== undefined
			? (this.allOptionsCache[bestScore.id] as Option)
			: undefined;
	}

	private async queryArea(): Promise<{
		[id: string]: {
			coords: [number, number];
			distance: number;
			currentPathString?: string;
		};
	}> {
		const results: {
			[id: string]: {
				coords: [number, number];
				distance: number;
				currentPathString?: string;
			};
		} = {};

		const geoQuery = this.geoCollection.near({
			center: new GeoPoint(
				this.tripRequest.pickup!.coordinates!.latitude,
				this.tripRequest.pickup!.coordinates!.longitude
			),
			radius: this.searchRadius,
		});

		const values = await geoQuery.get();

		values.forEach((doc) => {
			if (this.skipList.has(doc.id)) return;
			results[doc.id] = {
				coords: [
					doc.data().g.geopoint.latitude,
					doc.data().g.geopoint.longitude,
				],
				distance: doc.distance,
				currentPathString: doc.data().currentPathString as string,
			};
		});

		return results;
	}
}

export { DriverSearchService, Option, Walk };
