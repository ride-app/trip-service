/**
 * Unit Tests for the API Endpoints
 *
 * @group unit
 */
import { expect, it, describe } from "bun:test";

function greeter(name: string) {
	return `Hello, ${name}!`;
}

// Test for greeter function
describe("greeter", () => {
	it("should return a greeting", () => {
		expect(greeter("test")).toBe("Hello, test!");
	});
});
