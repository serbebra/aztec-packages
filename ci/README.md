# Build System

The Aztec build-system aims to run builds on exactly two targets: a user's system, or Github Actions.

The ci name is used because it evokes the main usecase and is short.

The extensionless files in this folder are shell scripts to be used by .github/workflows/ci.yml

## How do I get my PRs merged?

You need to pass merge-check by successfully completing all the jobs it depends on.
On aztec-packages, pushers have a personal runner that is created when needed with a persistent cache disk.
Run `gh act -W .github/workflows/ci.yml pull_request --job build` to build the machine e2e test prerequisites.
This will target your runner. It is possible to do the same with
you will connect to your builderby default, you can also target your local machine with and --env LOCAL_BUILDER=true LOCAL_RUNNER=true

## Design

- Focused around docker-compatible containers.
- Focused on providing a platform for creating images with Earthly (https://earthly.dev/) and then running them either through an earthly target or a docker commands.
- Run on runners with a persistent disk for speed, but not a necessity.
- Enable building on EC2 spot instances. They're extremely cheap and powerful relative to CI offerings.
- Avoid vendor lock-in (don't use vendor specific features) as much as practical, otherwise support local and Github Actions.

## Overview

Builds happen in CI on earthly runners with persistent disk. They sometimes communicate to other test runners.

There are Earthfile files throughout the repository that describe the core build artifacts. Then, the scripts here allow for running repeatably.

There is a `.github/ci.yml` file that describes various jobs and their dependencies. Generally, there is extra detail there related to repeatable CI builds that doesn't apply locally. To run locally, copy the commands from ci.yml, they should work out of the box.

A rebuild pattern is a regular expression that is matched against a list of changed files. We often use pretty broad regular expressions that trigger rebuilds if _any_ file in a project changes, but you can be more fine-grained, e.g. not triggering rebuilds if you change something inconsequential.

## Usage

Add the build system into your repository as a git subrepo located at `/build-system`. Circle CI expects a `.circleci/config.yml` file from which you can leverage the build scripts.

At the start of each job, it's necessary to setup the build environment e.g.

```
./build-system/scripts/setup_env "$CIRCLE_SHA1" "$CIRCLE_TAG" "$CIRCLE_JOB" "$CIRCLE_REPOSITORY_URL" "$CIRCLE_BRANCH"
```

Once called all scripts are available directly via `PATH` update, and various other env vars expected by scripts are set. You'll want to `source` the above script if you intend to use the build system within the calling shell.

Jobs will usually leverage one of the following scripts. View the scripts themselves for further documentation:

- `build`
- `deploy`
- `deploy_global`
- `cond_spot_run_build`
- `cond_spot_run_tests`

There are more fine grained scripts that maybe used in some cases such as:

- `deploy_ecr`
- `deploy_terraform`
- `deploy_npm`
- `deploy_s3`
- `deploy_dockerhub`
