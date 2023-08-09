import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const serviceName =
	new pulumi.Config("service").get("name") || pulumi.getProject();
const location = gcp.config.region || "asia-east1";

const github_connection = gcp.cloudbuildv2.Connection.get(
	"github-connection",
	pulumi.interpolate`projects/${gcp.config.project}/locations/${location}/connections/GitHub`,
);

const repository = new gcp.cloudbuildv2.Repository("repository", {
	location,
	name: serviceName,
	parentConnection: github_connection.name,
	remoteUri: pulumi.interpolate`https://github.com/ride-app/${serviceName}.git`,
});

new gcp.cloudbuild.Trigger("build-trigger", {
	name: serviceName,
	location,
	repositoryEventConfig: {
		repository: repository.id,
		push: {
			branch: "^main$",
		},
	},
	filename: "cloudbuild.yaml",
	includeBuildLogs: "INCLUDE_BUILD_LOGS_WITH_STATUS",
	substitutions: {
		_FIREBASE_DATABASE_URL: new pulumi.Config("firebase").require(
			"databaseURL",
		),
		_NOTIFICATION_SERVICE_URL: new pulumi.Config().require(
			"notificationServiceUrl",
		),
		_DEBUG: new pulumi.Config().get("debug") ?? "false",
	},
});
