import { Person } from "../gen/ride/trip/v1alpha1/types";
import { getUser } from "../repositories/auth-repository";

async function getPersonFromUid(id: string) {
  const record = await getUser(id);
  return Person.create({
    uid: record.uid,
    name: record.displayName,
    photoUrl: record.photoURL,
    phoneNumber: record.phoneNumber,
  });
}

export default getPersonFromUid;
