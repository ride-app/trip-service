import { Code, ConnectError, type HandlerContext } from "@bufbuild/connect";
import { verifyIdToken } from "../repositories/auth-repository.js";

const verifyAuthHeader = async (context: HandlerContext): Promise<string> => {
	try {
		if (context.requestHeader.get("authorization") === null) {
			throw new ConnectError("missing authorization", Code.Unauthenticated);
		}
		const token = context.requestHeader.get("authorization").toString();

		if (!token.startsWith("Bearer ")) {
			throw new ConnectError("invalid token format", Code.Unauthenticated);
		}

		return await verifyIdToken(token.split("Bearer ")[1]);
	} catch (e) {
		throw new ConnectError("invalid authorization", Code.Unauthenticated);
	}
};

export default verifyAuthHeader;
