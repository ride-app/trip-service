import { LatLngTuple } from "@googlemaps/polyline-codec";

function indexOfPointOnPath(point: LatLngTuple, path: LatLngTuple[]): number {
	for (let i = 0; i < path.length; i += 1) {
		if (path[i][0] === point[0] && path[i][1] === point[1]) return i;
	}
	return -1;
}

function findIntersection(
	basePath: LatLngTuple[],
	overPlayPath: LatLngTuple[]
) {
	if (basePath.length === 0 || overPlayPath.length === 0) return null;

	const map: { [key: string]: boolean } = {};

	const commonPoints: LatLngTuple[] = [];

	let firstIndex = -1;
	let lastIndex = -1;

	basePath.forEach((e) => {
		map[e.toString()] = true;
	});

	for (let i = 0; i < overPlayPath.length; i += 1) {
		const e = overPlayPath[i];
		if (map[e.toString()]) {
			commonPoints.push(e);
			if (firstIndex < 0) firstIndex = i;
			lastIndex = i;
		} else if (commonPoints.length >= 1) {
			break;
		} else;
	}

	return commonPoints.length > 0
		? {
				firstIndex,
				lastIndex,
				points: commonPoints,
		  }
		: null;
}

export { indexOfPointOnPath, findIntersection };
