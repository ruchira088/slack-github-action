import * as core from "@actions/core"
import * as github from "@actions/github"
import {SSMClient} from "@aws-sdk/client-ssm"
import {loginToAws} from "./aws"
import {map} from "./helpers"
import {REPOSITORY_OWNER, runNotificationWorkflow} from "./github"
import {GithubWorkflowRun} from "./types"

async function runGitHubWorkflow() {
  const awsRoleArn: string = core.getInput("aws-role-arn")
  const awsRegion: string = core.getInput("aws-region")
  const slackChannel: string = core.getInput("slack-channel")

  if (!github.context.payload.repository?.full_name?.startsWith(REPOSITORY_OWNER)) {
    throw new Error(
      `Only repositories owned by ${REPOSITORY_OWNER} can use this GitHub Action.
Payload: ${JSON.stringify(github.context.payload, null, 2)}`
    )
  }

  const awsSessionName: string | undefined = map(github.context.payload.repository?.name, name => `${name}-oidc`)
  const awsCredentials = await loginToAws(awsRoleArn, awsRegion, awsSessionName)

  const ssmClient = new SSMClient({region: awsRegion, credentials: awsCredentials})


  const githubWorkflowRun: GithubWorkflowRun = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    runId: github.context.runId
  }

  await runNotificationWorkflow(ssmClient, githubWorkflowRun, slackChannel)
}

runGitHubWorkflow()
