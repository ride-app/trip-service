import type { Firestore } from "firebase-admin/firestore";
import polyline from "@googlemaps/polyline-codec";
import {
	distanceBetween,
	geohashQueryBounds,
	type Geopoint,
} from "geofire-common";
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
import { logDebug, logInfo } from "../utils/logger.js";

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

function getOptimalRoute(
	location: [number, number],
	currentPath: [number, number][] | undefined,
	overlayPath: [number, number][],
	allowWalk = false,
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
				currentPath,
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
			!allowWalk ||
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

	private skipList: Set<string> = new Set<string>([]);

	private path: [number, number][];

	private geoCollection: firestore.CollectionReference;

	constructor(
		searchRadius: number,
		tripRequest: CreateTripRequest,
		firestore: Firestore,
	) {
		if (!tripRequest.trip) {
			throw new Error("Trip request must contain a trip");
		}

		if (!tripRequest.trip.route?.pickup?.polylineString) {
			throw new Error("Trip request must contain a pickup polyline");
		}

		logInfo(`Initializing driver search service for ${tripRequest.trip.name}`);

		this.tripRequest = tripRequest;

		logInfo("Decoding polyline");
		this.path = polyline.decode(tripRequest.trip.route.pickup.polylineString);

		this.geoCollection = firestore.collection("activeDrivers");
		logInfo("Geocollection initialized");

		this.searchRadius = searchRadius;
		this.skipList = new Set(
			this.tripRequest.ignore.map((d) => d.split("/").pop()!),
		);
	}

	addToSkipList(id: string) {
		this.skipList.add(id);
	}

	async findDriver(): Promise<Driver | undefined> {
		logInfo("Finding nearest drivers");
		const scoreMap: MinHeap<{ id: string; scoreVector: ScoreVector }> =
			new MinHeap<{
				id: string;
				scoreVector: ScoreVector;
			}>((n) => n.scoreVector.length);

		/// Get nearest Vehicles
		const nearestDrivers = await this.findNearestDrivers();
		logInfo(`Found ${Object.keys(nearestDrivers).length} drivers nearby`);

		Object.keys(nearestDrivers).forEach((id) => {
			logInfo(`Processing driver ${id}`);
			const result = nearestDrivers[id];
			const cachedDriver = this.allDriversCache[id];

			if (
				cachedDriver.currentPathString !== result.currentPathString ||
				cachedDriver.location.toString() !== result.location.toString()
			) {
				logInfo(
					`Driver ${id} path/location changed or didn't exist. Recommputing optimal route`,
				);
				const optimalRoute = getOptimalRoute(
					result.location,
					result.currentPathString
						? polyline.decode(result.currentPathString)
						: undefined,
					this.path,
					this.tripRequest.trip?.type === Trip_Type.SHARED,
				);

				logInfo(`Updating driver ${id}`);
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
				logInfo(`Driver ${id} has optimal route. Adding to score map`);
				logDebug({
					distance: currentDriver.distance,
					pickupWalkLength: currentDriver.optimalRoute.pickupWalk?.length,
					dropOffWalkLength: currentDriver.optimalRoute.dropOffWalk?.length,
				});
				scoreMap.push({
					id,
					scoreVector: new ScoreVector(
						currentDriver.distance,
						(currentDriver.optimalRoute.pickupWalk?.length ?? 0) +
							(currentDriver.optimalRoute.dropOffWalk?.length ?? 0),
					),
				});
			}
		});

		const bestScore = scoreMap.pop();
		logInfo(`Best score: ${bestScore?.id ?? "undefined"}`);

		return bestScore !== undefined
			? (this.allDriversCache[bestScore.id] as Driver)
			: undefined;
	}

	private async findNearestDrivers(): Promise<
		Record<
			string,
			{
				location: [number, number];
				distance: number;
				currentPathString?: string;
			}
		>
	> {
		const results: Record<
			string,
			{
				location: [number, number];
				distance: number;
				currentPathString?: string;
			}
		> = {};

		const center: Geopoint = [
			this.tripRequest.trip!.route!.pickup!.coordinates!.latitude,
			this.tripRequest.trip!.route!.pickup!.coordinates!.longitude,
		];

		logInfo("Calculating geohash query bounds");
		const bounds = geohashQueryBounds(center, this.searchRadius);

		const promises: Promise<firestore.QuerySnapshot>[] = [];

		bounds.forEach((b) => {
			logInfo("Constructing query");
			logDebug(`Querying geohash range ${b[0]} to ${b[1]}`);
			const query = this.geoCollection
				.where(
					"vehicleType",
					"==",
					this.tripRequest.trip!.vehicleType.toString().toLowerCase(),
				)
				.orderBy("geohash")
				.startAt(b[0])
				.endAt(b[1]);

			promises.push(query.get());
			logInfo("Query added to promise list");
		});

		logDebug(`Promises: ${promises.length}`);

		logInfo("Waiting for queries to complete");

		const snapshots = await Promise.all(promises);

		logInfo("Queries completed");
		logDebug(`Snapshots: ${snapshots.length}`);

		snapshots.forEach((snap) => {
			logInfo(`Processing snapshot with ${snap.docs.length} docs`);
			snap.docs.forEach((doc) => {
				logInfo(`Constructing result for driver ${doc.id}`);
				if (this.skipList.has(doc.id)) {
					logInfo(`Skipping driver ${doc.id}`);
					return;
				}

				const lat = doc.get("location.latitude") as number;
				const lng = doc.get("location.longitude") as number;

				// We have to filter out a few false positives due to GeoHash
				// accuracy, but most will match
				const distanceInM = distanceBetween([lat, lng], center) * 1000;
				logDebug(`Distance: ${distanceInM}m`);

				if (distanceInM <= this.searchRadius) {
					results[doc.id] = {
						location: [lat, lng],
						distance: distanceInM,
						currentPathString: doc.data()["currentPathString"] as string,
					};
				}
			});
		});

		return results;
	}
}

export { DriverSearchService, type Driver, type Walk };
