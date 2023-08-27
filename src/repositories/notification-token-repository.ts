import type { NotificationService } from "@buf/ride_notification.connectrpc_es/ride/notification/v1alpha1/notification_service_connect.js";
import type { PromiseClient } from "@connectrpc/connect";
import { logError, logInfo } from "../utils/logger.js";

export default class NotificationTokenRepository {
	readonly #notificationApi: PromiseClient<typeof NotificationService>;

	constructor(notificationApi: PromiseClient<typeof NotificationService>) {
		this.#notificationApi = notificationApi;
		logInfo("Notification Token Repository initialized");
	}

	async getNotificationToken(uid: string) {
		try {
			const res = await this.#notificationApi.getNotificationToken({
				name: `users/${uid}`,
			});

			return res.token;
		} catch (error) {
			logError("Error getting notification token", error);

			return undefined;
		}
	}
}
