import {
	createPromiseClient,
	type ConnectRouter,
	type HandlerContext,
	type ServiceImpl,
	ConnectError,
	Code,
} from "@connectrpc/connect";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createConnectTransport } from "@connectrpc/connect-node";
import { NotificationService } from "@buf/ride_notification.connectrpc_es/ride/notification/v1alpha1/notification_service_connect";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp } from "firebase-admin/app";
import { TripService } from "../gen/ride/trip/v1alpha1/trip_service_connect";
import AuthRepository from "../repositories/auth-repository";
import createTrip from "./create-trip";
import getTrip from "./get-trip";
import startTripVerification from "./start-trip-verification";
import startTrip from "./start-trip";
import type {
	CancelTripRequest,
	CreateTripRequest,
	CreateTripResponse,
	EndTripRequest,
	GetTripRequest,
	StartTripRequest,
	StartTripVerificationRequest,
	WatchTripRequest,
} from "../gen/ride/trip/v1alpha1/trip_service_pb";
import DriverRepository from "../repositories/driver-repository";
import TripRepository from "../repositories/trip-repository";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";
import NotificationTokenRepository from "../repositories/notification-token-repository";

class Service implements ServiceImpl<typeof TripService> {
	readonly authRepository: AuthRepository;

	readonly driverRepository: DriverRepository;

	readonly tripRepository: TripRepository;

	readonly notificationTokenRepository: NotificationTokenRepository;

	readonly firestore: FirebaseFirestore.Firestore;

	constructor(
		authRepository: AuthRepository,
		driverRepository: DriverRepository,
		tripRepository: TripRepository,
		notificationTokenRepository: NotificationTokenRepository,
		firestore: FirebaseFirestore.Firestore,
	) {
		this.authRepository = authRepository;
		this.driverRepository = driverRepository;
		this.tripRepository = tripRepository;
		this.notificationTokenRepository = notificationTokenRepository;
		this.firestore = firestore;
	}

	async createTrip(
		req: CreateTripRequest,
		context: HandlerContext,
	): Promise<CreateTripResponse> {
		try {
			await this.verifyAuthHeader(context);
			return await createTrip(this, req);
		} catch (error) {
			if (error instanceof ConnectError) {
				logDebug("Error is ConnectError. Rethrowing");
				throw error;
			}

			logError("CreateTrip failed", error);
			throw new ConnectError("Internal server error", Code.Internal);
		}
	}

	async getTrip(req: GetTripRequest, context: HandlerContext) {
		try {
			await this.verifyAuthHeader(context);
			return await getTrip(this, req, context);
		} catch (error) {
			if (error instanceof ConnectError) {
				logDebug("Error is ConnectError. Rethrowing");
				throw error;
			}

			logError("GetTrip failed", error);
			throw new ConnectError("Internal server error", Code.Internal);
		}
	}

	async startTrip(req: StartTripRequest, context: HandlerContext) {
		try {
			await this.verifyAuthHeader(context);
			return await startTrip(this, req, context);
		} catch (error) {
			if (error instanceof ConnectError) {
				logDebug("Error is ConnectError. Rethrowing");
				throw error;
			}

			logError("StartTRip failed", error);
			throw new ConnectError("Internal server error", Code.Internal);
		}
	}

	async startTripVerification(
		req: StartTripVerificationRequest,
		context: HandlerContext,
	) {
		try {
			await this.verifyAuthHeader(context);
			return await startTripVerification(this, req, context);
		} catch (error) {
			if (error instanceof ConnectError) {
				logDebug("Error is ConnectError. Rethrowing");
				throw error;
			}

			logError("StartTripVerification failed", error);
			throw new ConnectError("Internal server error", Code.Internal);
		}
	}

	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/class-methods-use-this)
	async cancelTrip(req: CancelTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}

	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/class-methods-use-this)
	async endTrip(req: EndTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}

	// trunk-ignore(eslint/@typescript-eslint/no-unused-vars)
	// trunk-ignore(eslint/require-yield)
	// trunk-ignore(eslint/class-methods-use-this)
	async *watchTrip(req: WatchTripRequest) {
		throw new ConnectError("Method not implemented.", Code.Unimplemented);
	}

	private async verifyAuthHeader(context: HandlerContext): Promise<void> {
		try {
			// trunk-ignore(eslint/@typescript-eslint/no-unsafe-assignment)
			// trunk-ignore(eslint/@typescript-eslint/no-unsafe-call)
			// trunk-ignore(eslint/@typescript-eslint/no-unsafe-member-access)
			const token: string | undefined = context.requestHeader
				.get("authorization")
				?.toString();
			logDebug(`Token is: ${token}`);

			if (token === undefined) {
				logInfo("Missing authorization");
				throw new ConnectError("missing authorization", Code.Unauthenticated);
			}

			if (
				!token.startsWith("Bearer ") ||
				token.split("Bearer ")[1] === undefined
			) {
				logInfo("Invalid token");
				throw new ConnectError("invalid token", Code.Unauthenticated);
			}

			logInfo("Verifying token");
			const uid = await this.authRepository.verifyIdToken(
				token.split("Bearer ")[1]!,
			);

			logDebug(`UID from header is: ${uid}`);

			// trunk-ignore(eslint/@typescript-eslint/no-unsafe-member-access)
			// trunk-ignore(eslint/@typescript-eslint/no-unsafe-call)
			context.requestHeader.set("uid", uid);
		} catch (e) {
			logInfo("Invalid authorization");
			logWarn("Auth header verification failed", e);
			throw new ConnectError("invalid authorization", Code.Unauthenticated);
		}
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
	const authRepository = new AuthRepository(auth);
	const driverRepository = new DriverRepository(auth, firestore, fcm);
	const tripRepository = new TripRepository(firestore, auth);
	const notificationTokenRepository = new NotificationTokenRepository(
		notificationServiceClient,
	);

	const service = new Service(
		authRepository,
		driverRepository,
		tripRepository,
		notificationTokenRepository,
		firestore,
	);

	router.service(TripService, service);
}

export { Service, initializeService };
