import { Code, ConnectError, HandlerContext } from "@bufbuild/connect";
import { verifyIdToken } from "../repositories/auth-repository.js";

const verifyAuthHeader = async (context: HandlerContext): Promise<string> => {
	try {
		if (context.requestHeader.get("authorization").length === 0) {
			throw new ConnectError("Missing Authorization", Code.Unauthenticated);
		}
		const token = context.requestHeader.get("authorization")[0].toString();

		if (!token.startsWith("Bearer ")) {
			throw new ConnectError("Invalid Authorization", Code.Unauthenticated);
		}

		return await verifyIdToken(token.split("Bearer ")[1]);
	} catch (e) {
		throw new ConnectError("Invalid Authorization", Code.Unauthenticated);
	}
};

export default verifyAuthHeader;
