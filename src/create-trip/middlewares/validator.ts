import { RequestHandler } from 'express';
import { TripLocation } from '../models/trip-request';
import { TripTypes } from '../models/trip-type';

const requestValidator: RequestHandler = (req, res, next) => {
	try {
		if (
			!req.body.vehicleType ||
			!req.body.type ||
			!req.body.locations ||
			!req.body.polyline ||
			// !req.body.text ||
			!req.body.passengers
		) {
			res.status(403);
			throw Error('Missing Parameters');
		}

		const locations = req.body.locations as TripLocation[];

		if (!TripTypes.find((t) => t === (req.body.type as string))) {
			res.status(403);
			throw Error('Invalid Trip Type');
		}

		if (
			locations.length < 2 ||
			locations[0].location.toString() ===
				locations[locations.length - 1].location.toString()
		) {
			res.status(403);
			throw Error('Pickup and destination location are same');
		}
		next();
	} catch (e) {
		next(e);
	}
};

export default requestValidator;
