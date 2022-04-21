class Vehicle {
	id: string;

	regNumber: string;

	constructor(id: string, regNumber: string) {
		this.id = id;
		this.regNumber = regNumber;
	}

	// toJSON() {
	// 	return {
	// 		id: this.id,
	// 		regNumber: this.regNumber,
	// 	};
	// }
}

export default Vehicle;
