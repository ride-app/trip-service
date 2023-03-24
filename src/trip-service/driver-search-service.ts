import polyline from "@googlemaps/polyline-codec";
import { getFirestore } from "firebase-admin/firestore";
import { distanceBetween, geohashQueryBounds, Geopoint } from "geofire-common";
import type { firestore } from "firebase-admin";

import ScoreVector from "../models/score-vector.js";
import {
	CreateTripRequest,
	Trip_Type,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import MinHeap from "../utils/min-heap.js";
import {
	haversine,
	pathLength,
	distanceToPathSegment,
} from "../utils/distance.js";

import { findIntersection, indexOfPointOnPath } from "../utils/paths.js";

interface Driver {
	// driver: Driver;
	driverId: string;
	location: [number, number];
	distance: number;
	currentPathString: string | undefined;
	optimalRoute: NonNullable<ReturnType<typeof getOptimalRoute>>;
}

interface CachedDriver {
	// driver: Driver;
	driverId: string;
	location: [number, number];
	distance: number;
	currentPathString: string | undefined;
	optimalRoute: ReturnType<typeof getOptimalRoute>;
}

interface Walk {
	path: [number, number][];
	polyline: string;
	length: number;
}

function checkVehicleCrossedPoint(
	location: [number, number],
	point: [number, number],
	path: [number, number][]
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
	location: [number, number],
	currentPath: [number, number][] | undefined,
	overlayPath: [number, number][],
	allowWalk = false
): {
	pickupWalk?: Walk;
	dropOffWalk?: Walk;
	tripPath: [number, number][];
	tripPathPolyline: string;
	newVehiclePathPolyline: string;
} | null {
	if (overlayPath.length === 0) return null;
	// If there is no current path, then overlayPath is the optimal path
	if (currentPath === undefined || currentPath.length === 0) {
		const path = polyline.encode(overlayPath);
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
			polyline: polyline.encode(path),
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
			polyline: polyline.encode(path),
			length,
		};
	}

	return {
		pickupWalk,
		dropOffWalk,
		tripPath,
		tripPathPolyline: polyline.encode(tripPath),
		newVehiclePathPolyline: polyline.encode(newVehiclePath),
	};
}

class DriverSearchService {
	readonly tripRequest: CreateTripRequest;

	searchRadius: number;

	private allDriversCache: Record<string, CachedDriver> = {};

	private skipList: Set<string> = new Set([]);

	private path: [number, number][];

	private geoCollection: firestore.CollectionReference;

	constructor(searchRadius: number, tripRequest: CreateTripRequest) {
		if (!tripRequest.trip) {
			throw new Error("Trip request must contain a trip");
		}

		if (!tripRequest.trip.route?.pickup?.polylineString) {
			throw new Error("Trip request must contain a pickup polyline");
		}

		this.tripRequest = tripRequest;
		this.path = polyline.decode(tripRequest.trip.route.pickup.polylineString);
		// this.geoCollection = initializeApp(getFirestore()).collection(
		// 	tripRequest.trip.vehicleType.toLowerCase()
		// );
		this.geoCollection = getFirestore().collection(
			tripRequest.trip.vehicleType.toLowerCase()
		);
		this.searchRadius = searchRadius;
		this.skipList = new Set(
			this.tripRequest.ignore.map((d) => d.split("/").pop()!)
		);
	}

	addToSkipList(id: string) {
		this.skipList.add(id);
	}

	async findDriver(): Promise<Driver | undefined> {
		const scoreMap: MinHeap<{ id: string; scoreVector: ScoreVector }> =
			new MinHeap((n) => n.scoreVector.length);

		/// Get nearest Vehicles
		const nearestDrivers = await this.findNearestDrivers();

		Object.keys(nearestDrivers).forEach((id) => {
			const result = nearestDrivers[id];
			const cachedDriver = this.allDriversCache[id];

			if (
				cachedDriver === undefined ||
				cachedDriver.currentPathString !== result.currentPathString ||
				cachedDriver.location.toString() !== result.location.toString()
			) {
				const optimalRoute = getOptimalRoute(
					result.location,
					result.currentPathString
						? polyline.decode(result.currentPathString)
						: undefined,
					this.path,
					this.tripRequest.trip?.type === Trip_Type.SHARED
				);

				this.allDriversCache[id] = {
					driverId: id,
					location: result.location,
					currentPathString: result.currentPathString,
					distance: result.distance,
					optimalRoute,
				};
			}

			const currentDriver = this.allDriversCache[id];

			if (currentDriver.optimalRoute !== null) {
				scoreMap.push({
					id,
					scoreVector: new ScoreVector(
						currentDriver.distance,
						(currentDriver.optimalRoute.pickupWalk?.length ?? 0) +
							(currentDriver.optimalRoute.dropOffWalk?.length ?? 0)
					),
				});
			}
		});

		const bestScore = scoreMap.pop();

		return bestScore !== undefined
			? (this.allDriversCache[bestScore.id] as Driver)
			: undefined;
	}

	private async findNearestDrivers(): Promise<{
		[id: string]: {
			location: [number, number];
			distance: number;
			currentPathString?: string;
		};
	}> {
		const results: {
			[id: string]: {
				location: [number, number];
				distance: number;
				currentPathString?: string;
			};
		} = {};

		const center: Geopoint = [
			this.tripRequest.trip!.route!.pickup!.coordinates!.latitude,
			this.tripRequest.trip!.route!.pickup!.coordinates!.longitude,
		];

		const bounds = geohashQueryBounds(center, this.searchRadius);

		const promises: Promise<firestore.QuerySnapshot<firestore.DocumentData>>[] =
			[];

		bounds.forEach((b) => {
			const q = this.geoCollection.orderBy("geohash").startAt(b[0]).endAt(b[1]);

			promises.push(q.get());
		});

		await Promise.all(promises).then((snapshots) => {
			snapshots.forEach((snap) => {
				snap.docs.forEach((doc) => {
					if (this.skipList.has(doc.id)) return;

					const lat = doc.get("location.latitude");
					const lng = doc.get("location.longitude");

					// We have to filter out a few false positives due to GeoHash
					// accuracy, but most will match
					const distanceInM = distanceBetween([lat, lng], center) * 1000;

					if (distanceInM <= this.searchRadius) {
						results[doc.id] = {
							location: [lat, lng],
							distance: distanceInM,
							currentPathString: doc.data()["currentPathString"] as string,
						};
					}
				});
			});
		});

		return results;
	}
}

export { DriverSearchService, Driver, Walk };
