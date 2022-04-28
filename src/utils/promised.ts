export type Promised<T> = T extends PromiseLike<infer R> ? R : T;
