import { Code, ConnectError, type HandlerContext } from "@bufbuild/connect";
import { verifyIdToken } from "../repositories/auth-repository.js";
import { logDebug, logError, logInfo } from "./logger.js";

const verifyAuthHeader = async (context: HandlerContext): Promise<void> => {
	try {
		const token = context.requestHeader.get("authorization").toString();
		logDebug("Token is: " + token);

		if (context.requestHeader.get("authorization") === null) {
			logInfo("Missing authorization");
			throw new ConnectError("missing authorization", Code.Unauthenticated);
		}

		if (!token.startsWith("Bearer ")) {
			logInfo("Invalid token format");
			throw new ConnectError("invalid token format", Code.Unauthenticated);
		}

		logInfo("Verifying token");
		const uid = await verifyIdToken(token.split("Bearer ")[1]);

		logDebug("UID from header is: " + uid);

		context.requestHeader.set("uid", uid);
	} catch (e) {
		logInfo("Invalid authorization");
		logError(e);
		throw new ConnectError("invalid authorization", Code.Unauthenticated);
	}
};

export default verifyAuthHeader;
