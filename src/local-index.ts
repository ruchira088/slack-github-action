import {SSMClient} from "@aws-sdk/client-ssm"
import {runNotificationWorkflow} from "./github"
import {GithubWorkflowRun} from "./types"

async function runLocalWorkflow(success: boolean) {
  const ssmClient = new SSMClient({region: "ap-southeast-2"})

  const runId = success ? 12629662712 : 12629623430

  const githubWorkflowRun: GithubWorkflowRun = {
    runId,
    owner: "ruchira088",
    repo: "slack-github-action"
  }

  await runNotificationWorkflow(ssmClient, githubWorkflowRun, "github-actions")
}

// runLocalWorkflow(true)
runLocalWorkflow(false)
