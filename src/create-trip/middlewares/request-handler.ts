import { RequestHandler } from 'express';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { TripRequest } from '../models/trip-request';
import search from '../create-trip';

const requestHandler: RequestHandler = async (req, res, next) => {
	try {
		const user: UserRecord = await getAuth().getUser(res.locals.uid);
		const tripRequest = TripRequest.fromJson(req.body);
		const val = await search(tripRequest, user);
		if (val === undefined) {
			res.status(409).json({ message: 'No available rides found nearby' });
		}
		res.json(val);
	} catch (e) {
		next(e);
	}
};

export default requestHandler;
