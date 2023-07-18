import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const imageconfig = new pulumi.Config("image");
const serviceConfig = new pulumi.Config("service");
const firebaseConfig = new pulumi.Config("firebase");

const location = gcp.config.region || "asia-south2";
const serviceName = serviceConfig.get("name") || pulumi.getProject();

// Cloud Run
const service = new gcp.cloudrun.Service("service", {
	name: serviceName,
	location,
	template: {
		metadata: {
			annotations: {
				"autoscaling.knative.dev/maxScale": "10",
			},
		},
		spec: {
			containers: [
				{
					image: `asia-south2-docker.pkg.dev/${
						gcp.config.project
					}/docker-registry/${serviceName}:${
						imageconfig.get("tag") ?? "latest"
					}`,
					ports: [{ containerPort: 50051, name: "h2c" }],
					envs: [
						{
							name: "FIREBASE_DATABASE_URL",
							value: firebaseConfig.require("databaseURL"),
						},
						{
							name: "NOTIFICATION_SERVICE_URL",
							value: new pulumi.Config().require("notificationServiceUrl"),
						},
					],
				},
			],
		},
	},
});

const policyData = gcp.organizations.getIAMPolicy({
	bindings: [
		{
			role: "roles/run.invoker",
			members: ["allUsers"],
		},
	],
});

const noauthIamPolicy = new gcp.cloudrun.IamPolicy("no-auth-iam-policy", {
	location: service.location,
	project: service.project,
	service: service.name,
	policyData: policyData.then((noauthIAMPolicy) => noauthIAMPolicy.policyData),
});

export const name = service.name;
