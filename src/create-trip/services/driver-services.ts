import { getMessaging } from "firebase-admin/messaging";
import { FieldValue, GeoPoint, getFirestore } from "firebase-admin/firestore";
import { Option } from "./driver-search-service";
import { CreateTripRequest } from "../../gen/ride/trip/v1alpha1/trip_service";

interface DriverData {
  vehicleId: string;
  vehicleNumber: string;
  notificationToken: string;
  capacity: number;
}

async function sendNotification(notificationToken: string) {
  return getMessaging().send({
    token: notificationToken,
    notification: {
      title: "You have a new Ride request",
    },
    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      sound: "default",
      icon: "default",
    },
    android: {
      ttl: 45,
      notification: {
        priority: "max",
        channelId: "new_ride",
        sound: "alert.mp3",
        vibrateTimingsMillis: [0, 1000, 3000, 1000, 3000, 1000],
        visibility: "public",
      },
    },
  });
}

async function sendOffer(
  tripId: string,
  tripRequest: CreateTripRequest,
  option: Option
) {
  const driverRef = getFirestore()
    .collection("activeDrivers")
    .doc(option.driver.id);
  const tripRequestRef = driverRef.collection("tripOffers").doc(tripId);
  const expiresAt = Date.now() + 30000;

  await tripRequestRef.set({
    accepted: false,
    expiresAt,
    polyline: option.optimalRoute.newVehiclePathPolyline,
    locations: [
      // TODO: Don't forget about these null checks
      new GeoPoint(
        ...(option.optimalRoute.tripPath[0] ?? [
          tripRequest.pickup?.coordinates?.latitude,
          tripRequest.pickup?.coordinates?.longitude,
        ])
      ),
      new GeoPoint(
        ...(option.optimalRoute.tripPath[-1] ?? [
          tripRequest.dropoff?.coordinates?.latitude,
          tripRequest.dropoff?.coordinates?.longitude,
        ])
      ),
    ],
  });

  try {
    await sendNotification(option.driver.notificationToken);
  } catch (error) {
    console.error(error);
  }

  const timeout = setTimeout(() => {
    tripRequestRef.delete();
  }, expiresAt - Date.now());

  const accepted: boolean = await new Promise<boolean>((ready) => {
    let initialReadComplete = false;

    const unsubscribe = driverRef
      .collection("tripOffers")
      .doc(tripId)
      .onSnapshot((snap) => {
        if (initialReadComplete) {
          if (!snap.data() && snap.get("accepted") === true) {
            unsubscribe();
            ready(true);
          } else {
            ready(false);
          }
        } else {
          initialReadComplete = true;
        }
      });
  });

  clearTimeout(timeout);

  if (!accepted) {
    driverRef.update({
      capacity: FieldValue.increment(tripRequest.passengers),
    });
  }

  return accepted;
}

function getDriverDataIfCapacityAvailable(
  driverId: string,
  passengers: number
): Promise<DriverData | undefined> {
  const firestore = getFirestore();
  return firestore.runTransaction(async (transaction) => {
    const driverRef = firestore.collection("activeDrivers").doc(driverId);
    const driverData = await transaction.get(driverRef);

    if (driverData.exists && driverData.get("capacity") >= passengers) {
      transaction.update(driverRef, {
        capacity: FieldValue.increment(-passengers),
      });
      return driverData.data() as DriverData;
    }
    return undefined;
  });
}

export { sendOffer, getDriverDataIfCapacityAvailable, DriverData };
