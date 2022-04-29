import Vehicle from "./vehicle";

class Driver {
  id: string;

  name!: string;

  location: [number, number];

  distance: number;

  currentPathString!: string | undefined;

  // currentPath!: LatLngTuple[];

  // ETA!: number;

  // _rating: number;
  notificationToken!: string;

  phone!: string;

  photoUrl!: string;

  vehicle!: Vehicle;

  // vehicleId!: string;

  // vehicleNumber!: string;

  constructor(
    id: string,
    location: [number, number],
    distance: number,
    currentPathString: string | undefined
  ) {
    this.id = id;
    this.location = location;
    this.distance = distance;
    this.currentPathString = currentPathString;
  }

  // toJSON() {
  // 	return {
  // 		id: this.id,
  // 		location: this.location,
  // 		distance: this.distance,
  // 		name: this.name,
  // 		phone: this.phone,
  // 		photoUrl: this.photoUrl,
  // 		vehicle: this.vehicle?.toJSON(),
  // 		// rating: this._rating
  // 	};
  // }
}

export default Driver;
