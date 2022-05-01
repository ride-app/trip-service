import { Metadata } from "@grpc/grpc-js";
import { verifyIdToken } from "../repositories/auth-repository";
import { ExpectedError, Reason } from "./errors/expected-error";

const verifyAuthHeader = async (metadata: Metadata): Promise<string> => {
	try {
		if (metadata.get("authorization").length === 0) {
			throw new ExpectedError("Missing Authorization", Reason.INVALID_AUTH);
		}
		const token = metadata.get("authorization")[0].toString();

		if (!token.startsWith("Bearer ")) {
			throw new ExpectedError("Invalid Authorization", Reason.INVALID_AUTH);
		}

		return await verifyIdToken(token.split("Bearer ")[1]);
	} catch (e) {
		throw new ExpectedError("Invalid Authorization", Reason.INVALID_AUTH);
	}
};

export default verifyAuthHeader;
