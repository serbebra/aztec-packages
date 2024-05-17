import * as core from "@actions/core";
import * as github from "@actions/github";

export interface ConfigInterface {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;

  spotName: string;
  githubJobId: string;
  githubRef: string;
  isPersistentSpot: number;
  subaction: string;

  ec2InstanceType: string[];
  ec2AmiId: string;
  ec2InstanceTags: string;
  ec2InstanceTtl: string;
  ec2SecurityGroupId: string;
  ec2SubnetId: string;
  clientToken?: string;
  ec2KeyName: string;
  ec2SpotInstanceStrategy: string;
  ec2Key: string;
}

export class ActionConfig implements ConfigInterface {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  subaction: string;

  spotName: string;
  githubJobId: string;
  githubRef: string;
  isPersistentSpot: number;

  ec2InstanceType: string[];
  ec2AmiId: string;
  ec2InstanceTags: string;
  ec2InstanceTtl: string;
  ec2SecurityGroupId: string;
  ec2SubnetId: string;
  clientToken?: string;
  ec2KeyName: string;
  ec2SpotInstanceStrategy: string;
  ec2Key: string;

  constructor() {
    // This input scheme is compatible with github actions, but is historical.
    // TODO: undo this with something more idiomatic.
    // AWS account and credentials params
    this.awsAccessKeyId = process.env.INPUT_AWS_ACCESS_KEY_ID || "";
    this.awsSecretAccessKey = process.env.INPUT_SECRET_ACCESS_KEY || ""
    this.awsRegion = process.env.INPUT_AWS_REGION || "";

    this.spotName = process.env.INPUT_SPOT_NAME || "";
    this.clientToken = process.env.INPUT_CLIENT_TOKEN || "";
    // Github params
    this.githubJobId = process.env.INPUT_JOB_ID || "";
    this.isPersistentSpot = process.env.INPUT_IS_PERSISTENT_SPOT ? 1 : 0;
    this.githubRef = process.env.INPUT_GIT_COMMIT || "";
    this.subaction = process.env.INPUT_SUBACTION || "";

    // Ec2 params
    this.ec2InstanceType = (process.env.INPUT_EC2_INSTANCE || "").split(" ");
    this.ec2AmiId = process.env.EC2_AMI_ID || "";
    this.ec2InstanceTags = process.env.INPUT_EC2_INSTANCE_TAGS || "";
    this.ec2InstanceTtl = process.env.INPUT_EC2_INSTANCE_TTL || "";
    this.ec2SubnetId = process.env.INPUT_EC2_SUBNET_ID || "";
    this.ec2KeyName = process.env.INPUT_EC2_KEY_NAME || "";
    this.ec2SecurityGroupId = process.env.INPUT_EC2_SECURITY_GROUP_ID || "";
    this.ec2SpotInstanceStrategy = (process.env.INPUT_EC2_SPOT_INSTANCE_STRATEGY || "").toLowerCase();
    this.ec2Key = process.env.INPUT_EC2_KEY || "";
  }
}
