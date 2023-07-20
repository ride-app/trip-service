import { Auth, UserRecord } from "firebase-admin/auth";

export default class AuthRepository {
	readonly #auth: Auth;

	constructor(auth: Auth) {
		this.#auth = auth;
	}

	async verifyIdToken(idToken: string): Promise<string> {
		return (await this.#auth.verifyIdToken(idToken)).uid;
	}

	getUser(id: string): Promise<UserRecord> {
		return this.#auth.getUser(id);
	}
}
