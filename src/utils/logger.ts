const debug = (message: unknown) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "DEBUG",
			message,
			timestamp: new Date().toISOString(),
		}),
	);
};

const info = (message: unknown) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "INFO",
			message,
			timestamp: new Date().toISOString(),
		}),
	);
};

const notice = (message: unknown) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "NOTICE",
			message,
			timestamp: new Date().toISOString(),
		}),
	);
};

const warn = (message: unknown) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "WARN",
			message,
			timestamp: new Date().toISOString(),
		}),
	);
};

const error = (message: unknown) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "ERROR",
			message,
			timestamp: new Date().toISOString(),
		}),
	);
};

export { debug, info, notice, warn, error };
