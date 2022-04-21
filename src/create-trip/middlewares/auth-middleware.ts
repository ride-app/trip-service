import { RequestHandler } from 'express';
import { getAuth } from 'firebase-admin/auth';

const authMiddleware: RequestHandler = async (req, res, next) => {
	try {
		if (!req.headers.authorization?.startsWith('Bearer ')) {
			res.status(401).header('WWW-Authenticate', 'Bearer');
			throw Error('Missing Authorization');
		}

		try {
			res.locals.uid = (
				await getAuth().verifyIdToken(
					req.headers.authorization.split('Bearer ')[1],
					true
				)
			).uid;
		} catch (e) {
			res.status(401).header('WWW-Authenticate', 'Bearer');
			throw Error('Invalid Authorization');
		}

		next();
	} catch (e) {
		next(e);
	}
};

export default authMiddleware;
