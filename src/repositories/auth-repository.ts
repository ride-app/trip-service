import { getAuth, UserRecord } from "firebase-admin/auth";

const verifyIdToken = async (idToken: string): Promise<string> =>
	(await getAuth().verifyIdToken(idToken)).uid;

const getUser = (id: string): Promise<UserRecord> => getAuth().getUser(id);

export { verifyIdToken, getUser };
