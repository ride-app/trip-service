// enum TripType {
// 	regular,
// 	shared,
// }

const TripTypes = ["regular", "shared"] as const;

type TripType = typeof TripTypes[number];

export { TripType, TripTypes };
