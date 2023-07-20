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

const logDebug = debug;

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

const logInfo = info;

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

const logNotice = notice;

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

const logWarn = warn;

const error = (...message: unknown[]) => {
	// trunk-ignore(eslint/no-console)
	console.log(
		JSON.stringify({
			severity: "ERROR",
			...message,
			timestamp: new Date().toISOString(),
		}),
	);
};

const logError = error;

export {
	debug,
	info,
	notice,
	warn,
	error,
	logDebug,
	logInfo,
	logNotice,
	logWarn,
	logError,
};
