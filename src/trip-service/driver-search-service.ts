import type { Firestore, QuerySnapshot } from "firebase-admin/firestore";
import polyline from "@googlemaps/polyline-codec";
import {
	distanceBetween,
	geohashQueryBounds,
	type Geopoint,
} from "geofire-common";
import type { firestore } from "firebase-admin";
import { Code, ConnectError } from "@bufbuild/connect";

import ScoreVector from "../models/score-vector.js";
import {
	CreateTripRequest,
	Trip_Type,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import MinHeap from "../utils/min-heap.js";

import { type Polyline } from "../utils/paths.js";
import { logDebug, logError, logInfo } from "../utils/logger.js";
import { RouteGenerator, type Route } from "./route-generator.js";

interface Driver {
	// driver: Driver;
	driverId: string;
	location: [number, number];
	distance: number;
	encodedDriverPath: Polyline | undefined;
	optimalRoute: Route;
}

interface CachedDriver {
	// driver: Driver;
	driverId: string;
	location: [number, number];
	distance: number;
	encodedDriverPath: Polyline | undefined;
	optimalRoute: Route | null;
}

class DriverSearchService {
	readonly tripRequest: CreateTripRequest;

	searchRadius: number;

	private allDriversCache: Record<string, CachedDriver> = {};

	private skipList: Set<string> = new Set<string>([]);

	private riderPath: [number, number][];

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
		this.riderPath = polyline.decode(
			tripRequest.trip.route.pickup.polylineString,
		);

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

			const driverPathChanged =
				cachedDriver.encodedDriverPath !== result.encodedDriverPath;
			const driverLocationChanged =
				cachedDriver.location.toString() !== result.location.toString();

			if (driverPathChanged || driverLocationChanged) {
				logInfo(
					`Driver ${id} path/location changed or didn't exist. Recomputing optimal route`,
				);

				const optimalRoute = new RouteGenerator(
					result.encodedDriverPath
						? polyline.decode(result.encodedDriverPath)
						: undefined,
				).getOptimalRoute(
					result.location,
					this.riderPath,
					this.tripRequest.trip?.type === Trip_Type.SHARED,
				);

				logInfo(`Updating driver ${id}`);
				this.allDriversCache[id] = {
					driverId: id,
					location: result.location,
					encodedDriverPath: result.encodedDriverPath,
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
				encodedDriverPath?: Polyline;
			}
		>
	> {
		const results: Record<
			string,
			{
				location: [number, number];
				distance: number;
				encodedDriverPath?: Polyline;
			}
		> = {};

		const center: Geopoint = [
			this.tripRequest.trip!.route!.pickup!.coordinates!.latitude,
			this.tripRequest.trip!.route!.pickup!.coordinates!.longitude,
		];

		logInfo("Calculating geohash query bounds");
		const bounds = geohashQueryBounds(center, this.searchRadius);

		const promises: Promise<QuerySnapshot>[] = bounds.map((b) => {
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

			logInfo("Adding query to promise list");
			return query.get();
		});

		logDebug(`Promises: ${promises.length}`);

		logInfo("Waiting for queries to complete");

		let snapshots: QuerySnapshot[];

		try {
			snapshots = await Promise.all(promises);
		} catch (error) {
			logError("Failed to query drivers", error);
			throw new ConnectError("Failed to query drivers", Code.Internal);
		}

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
				const distanceInMeters = distanceBetween([lat, lng], center) * 1000;
				logDebug(`Distance: ${distanceInMeters}m`);

				if (distanceInMeters <= this.searchRadius) {
					results[doc.id] = {
						location: [lat, lng],
						distance: distanceInMeters,
						encodedDriverPath: doc.data()["encodedDriverPath"] as string,
					};
				}
			});
		});

		return results;
	}
}

export { DriverSearchService, type Driver };
