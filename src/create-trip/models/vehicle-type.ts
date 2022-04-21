const VehicleTypes = ['eRickshaw', 'rickshaw'] as const;

type VehicleType = typeof VehicleTypes[number];

export { VehicleType, VehicleTypes };
