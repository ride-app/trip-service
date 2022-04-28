import { getAuth, UserRecord } from 'firebase-admin/auth';

const verifyIdToken = async (idToken: string): Promise<string> => {
	return (await getAuth().verifyIdToken(idToken)).uid;
};

const getUser = (id: string): Promise<UserRecord> => {
	return getAuth().getUser(id);
};

export { verifyIdToken, getUser };
