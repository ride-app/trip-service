import { VehicleType } from '../gen/ride/type/v1alpha1/types';

class Vehicle {
	id: string;

	type: VehicleType;

	regNumber: string;

	constructor(id: string, regNumber: string, type: VehicleType) {
		this.id = id;
		this.regNumber = regNumber;
		this.type = type;
	}

	// toJSON() {
	// 	return {
	// 		id: this.id,
	// 		regNumber: this.regNumber,
	// 	};
	// }
}

export default Vehicle;
