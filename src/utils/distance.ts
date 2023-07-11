function kmToMiles(distance: number): number {
	return Math.round(distance * 0.621371 * 1000000) / 1000000;
}

function distanceBetween(
	[lat1, long1]: [number, number],
	[lat2, long2]: [number, number],
) {
	const toRadian = (angle: number) => (Math.PI / 180) * angle;
	const distance = (a: number, b: number) => (Math.PI / 180) * (a - b);
	const RADIUS_OF_EARTH_IN_KM = 6371;

	const dLat = distance(lat2, lat1);
	const dLon = distance(long2, long1);

	const lat1Rad = toRadian(lat1);
	const lat2Rad = toRadian(lat2);

	const x =
		Math.sin(dLat / 2) ** 2 +
		Math.sin(dLon / 2) ** 2 * Math.cos(lat1Rad) * Math.cos(lat2Rad);
	const c = 2 * Math.asin(Math.sqrt(x));

	return RADIUS_OF_EARTH_IN_KM * c;
}

/**
 *
 * @param path Array of Latitude and Longitude Tuples
 * @returns Total Haversine Length of the path
 */
function pathLength(path: [lat: number, lng: number][]): number {
	let distance = 0;

	for (let i = 0; i < path.length - 1; i += 1)
		distance += distanceBetween(path[i]!, path[i + 1]!) * 1000;

	return distance;
}

/* idk wtf it does i just copied it from stackoverflow. Check this for info
https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
https://en.m.wikipedia.org/wiki/Distance_from_a_point_to_a_line
http://csharphelper.com/blog/2016/09/find-the-shortest-distance-between-a-point-and-a-line-segment-in-c/
*/
function distanceToPathSegment(
	[lat, lng]: [number, number],
	[x1, y1]: [number, number],
	[x2, y2]: [number, number],
): {
	distance: number;
	intersectionPoint: [number, number];
} {
	const A = lat - x1;
	const B = lng - y1;
	const C = x2 - x1;
	const D = y2 - y1;

	const dot = A * C + B * D;
	const lenSq = C * C + D * D;
	let param = -1;
	if (lenSq !== 0) param = dot / lenSq; // in case of 0 length line

	let xx;
	let yy;

	if (param < 0) {
		xx = x1;
		yy = y1;
	} else if (param > 1) {
		xx = x2;
		yy = y2;
	} else {
		xx = x1 + param * C;
		yy = y1 + param * D;
	}

	const dx = lat - xx;
	const dy = lng - yy;
	return {
		distance: Math.sqrt(dx * dx + dy * dy),
		intersectionPoint: [xx, yy],
	};
}

export {
	distanceBetween as haversine,
	kmToMiles,
	pathLength,
	distanceToPathSegment,
};
