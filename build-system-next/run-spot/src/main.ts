import * as core from "@actions/core";
import { ActionConfig } from "./config";
import { Ec2Instance } from "./ec2";
import { assertIsError } from "./utils";
require("aws-sdk/lib/maintenance_mode_message").suppress = true;

async function pollSpotStatus(
  ec2Client: Ec2Instance,
): Promise<string | "none"> {
  // 6 iters x 10000 ms = 1 minute
  for (let iter = 0; iter < 6; iter++) {
    const instances = await ec2Client.getInstancesForTags("running");
    if (instances.length <= 0) {
      // we need to start an instance
      return "none";
    }
    // wait 10 seconds
    await new Promise((r) => setTimeout(r, 10000));
  }
  // we have a bad state for a while, error
  core.warning(
    "Looped for 1 minutes and could only find spot with no runners!"
  );
  return "unusable";
}

async function requestAndWaitForSpot(config: ActionConfig): Promise<string> {
  // subaction is 'start' or 'restart'estart'
  const ec2Client = new Ec2Instance(config);

  let ec2SpotStrategies: string[];
  switch (config.ec2SpotInstanceStrategy) {
    case "besteffort": {
      ec2SpotStrategies = ["BestEffort", "none"];
      core.info(
        "Ec2 spot instance strategy is set to 'BestEffort' with 'None' as fallback"
      );
      break;
    }
    default: {
      ec2SpotStrategies = [config.ec2SpotInstanceStrategy];
      core.info(
        `Ec2 spot instance strategy is set to ${config.ec2SpotInstanceStrategy}`
      );
    }
  }

  let instanceId = "";
  for (const ec2Strategy of ec2SpotStrategies) {
    let backoff = 0;
    core.info(`Starting instance with ${ec2Strategy} strategy`);
    const MAX_ATTEMPTS = 3; // uses exponential backoff
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Start instance
      const instanceIdOrError =
        await ec2Client.requestMachine(
          // we fallback to on-demand
          ec2Strategy.toLocaleLowerCase() === "none"
        );
      // let's exit, only loop on InsufficientInstanceCapacity
      if (
        instanceIdOrError === "RequestLimitExceeded" ||
        instanceIdOrError === "InsufficientInstanceCapacity"
      ) {
        core.info(
          "Failed to create instance due to " +
            instanceIdOrError +
            ", waiting " + 5 * 2 ** backoff + " seconds and trying again."
        );
      } else {
        instanceId = instanceIdOrError;
        break;
      }
      // wait 10 seconds
      await new Promise((r) => setTimeout(r, 5000 * 2 ** backoff));
      backoff += 1;
      if (config.isPersistentSpot > 0) {
        core.info("Polling to see if we somehow have an instance up");
        instanceId = await ec2Client.getInstancesForTags("running")[0]?.instanceId;
      }
    }
    if (instanceId) {
      core.info("Successfully requested/found instance with ID " + instanceId);
      break;
    }
  }
  if (instanceId) await ec2Client.waitForInstanceRunningStatus(instanceId);
  else {
    core.error("Failed to get ID of running instance");
    throw Error("Failed to get ID of running instance");
  }
  return instanceId;
}

async function startEphemeralSpot(config: ActionConfig) {
  if (config.subaction !== "start") {
    throw new Error(
      "Unexpected subaction for bare spot, only 'start' is allowed: " +
        config.subaction
    );
  }
  const ec2Client = new Ec2Instance(config);
  const instanceId = await requestAndWaitForSpot(config);
  return await ec2Client.getPublicIpFromInstanceId(instanceId);
}

async function startPersistentSpot(config: ActionConfig) {
  if (config.subaction === "stop") {
    await terminate();
    return "";
  } else if (config.subaction === "restart") {
    await terminate();
    // then we make a fresh instance
  } else if (config.subaction !== "start") {
    throw new Error("Unexpected subaction: " + config.subaction);
  }
  // subaction is 'start' or 'restart'estart'
  const ec2Client = new Ec2Instance(config);
  let spotStatus = await pollSpotStatus(ec2Client);
  if (spotStatus === "unusable") {
    core.warning(
      "Taking down spot as it has no runners! If we were mistaken, this could impact existing jobs."
    );
    if (config.subaction === "restart") {
      throw new Error(
        "Taking down spot we just started. This seems wrong, erroring out."
      );
    }
    await terminate();
    spotStatus = "none";
  }
  let instanceId = "";
  let ip = "";
  if (spotStatus !== "none") {
    core.info(
      `Instance already running. Continuing as we can target it with jobs.`
    );
    instanceId = spotStatus;
    ip = await ec2Client.getPublicIpFromInstanceId(instanceId);
  } else {
    core.info(
      `Starting runner.`
    );
    instanceId = await requestAndWaitForSpot(config);
    ip = await ec2Client.getPublicIpFromInstanceId(instanceId);
    core.info("Done setting up runner.")
  }
  return true;
}

async function terminate(instanceStatus?: string, cleanupRunners = true) {
  try {
    core.info("Starting instance cleanup");
    const config = new ActionConfig();
    const ec2Client = new Ec2Instance(config);
    const instances = await ec2Client.getInstancesForTags(instanceStatus);
    await ec2Client.terminateInstances(instances.map((i) => i.InstanceId!));
  } catch (error) {
    core.info(error);
  }
}

async function main() {
  try {
    const config = new ActionConfig();
    if (config.isPersistentSpot !== 0) {
      await startPersistentSpot(config);
    } else {
      startEphemeralSpot(config);
    }
  } catch (error) {
    terminate();
    assertIsError(error);
    core.error(error);
    core.setFailed(error.message);
  }
}
main();
