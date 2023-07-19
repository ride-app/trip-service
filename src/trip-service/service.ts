import {
	createPromiseClient,
	type ConnectRouter,
	type HandlerContext,
	type ServiceImpl,
	ConnectError,
	Code,
} from "@bufbuild/connect";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createConnectTransport } from "@bufbuild/connect-node";
// trunk-ignore(eslint/import/extensions)
import { NotificationService } from "@buf/ride_notification.bufbuild_connect-es/ride/notification/v1alpha1/notification_service_connect.js";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp } from "firebase-admin/app";
import { TripService } from "../gen/ride/trip/v1alpha1/trip_service_connect.js";
import verifyAuthHeader from "../utils/verify-auth-header.js";
import createTrip from "./create-trip.js";
import getTrip from "./get-trip.js";
import startTripVerification from "./start-trip-verification.js";
import startTrip from "./start-trip.js";
import type {
	CancelTripRequest,
	CreateTripRequest,
	EndTripRequest,
	GetTripRequest,
	StartTripRequest,
	StartTripVerificationRequest,
	WatchTripRequest,
} from "../gen/ride/trip/v1alpha1/trip_service_pb.js";
import DriverRepository from "../repositories/driver-repository.js";
import TripRepository from "../repositories/trip-repository.js";

class Service implements ServiceImpl<typeof TripService> {
	readonly driverRepository: DriverRepository;

	readonly tripRepository: TripRepository;

	readonly firestore: FirebaseFirestore.Firestore;

	constructor(
		driverRepository: DriverRepository,
		tripRepository: TripRepository,
		firestore: FirebaseFirestore.Firestore,
	) {
		this.driverRepository = driverRepository;
		this.tripRepository = tripRepository;
		this.firestore = firestore;
	}

	async createTrip(req: CreateTripRequest, context: HandlerContext) {
		await verifyAuthHeader(context);
		return createTrip(this, req, context);
	}

	async getTrip(req: GetTripRequest, context: HandlerContext) {
		await verifyAuthHeader(context);
		return getTrip(this, req, context);
	}

	async startTrip(req: StartTripRequest, context: HandlerContext) {
		await verifyAuthHeader(context);
		return startTrip(this, req, context);
	}

	async startTripVerification(
		req: StartTripVerificationRequest,
		context: HandlerContext,
	) {
		await verifyAuthHeader(context);
		return startTripVerification(this, req, context);
	}

	// @ts-expect-error we will use req in the future
	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/class-methods-use-this)
	async cancelTrip(req: CancelTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}

	// @ts-expect-error we will use req in the future
	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/class-methods-use-this)
	async endTrip(req: EndTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}

	// @ts-expect-error we will use req in the future
	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/require-yield)
	// trunk-ignore(eslint/class-methods-use-this)
	async *watchTrip(req: WatchTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}
}

function initializeService(router: ConnectRouter) {
	initializeApp();
	const firestore = getFirestore();
	firestore.settings({ ignoreUndefinedProperties: true });
	const auth = getAuth();
	const fcm = getMessaging();
	const notificationServiceClient = createPromiseClient(
		NotificationService,
		createConnectTransport({
			baseUrl:
				process.env["NOTIFICATION_SERVICE_URL"] ?? "http://localhost:8080",
			httpVersion: "2",
		}),
	);
	const driverRepository = new DriverRepository(firestore, fcm);
	const tripRepository = new TripRepository(
		firestore,
		auth,
		notificationServiceClient,
	);

	const service = new Service(driverRepository, tripRepository, firestore);

	router.service(TripService, service);
}

// export default routes;
export { Service, initializeService };
