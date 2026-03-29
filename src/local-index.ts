import {SSMClient} from "@aws-sdk/client-ssm"
import {runNotificationWorkflow} from "./github"
import {GithubWorkflowRun} from "./types"
import {getParameter} from "./aws"
import * as github from "@actions/github"
import {type components} from "@octokit/openapi-types"

const GITHUB_REPO_OWNER = "ruchira088"
const GITHUB_REPO_NAME = "dynamic-dns"

type GithubWorkflowResult = components["schemas"]["workflow-run"]

async function runLocalWorkflow(isSuccess: boolean) {
  const ssmClient = new SSMClient({region: "ap-southeast-2"})
  const githubToken = await getParameter(ssmClient, "/github/slack-github-action/read")

  const octokit = github.getOctokit(githubToken)

  const workflowRuns = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner: GITHUB_REPO_OWNER,
    repo: GITHUB_REPO_NAME,
  })

  const workflowResult: GithubWorkflowResult | undefined = workflowRuns.data.workflow_runs
    .find((run: GithubWorkflowResult) => (run.conclusion === "success") === isSuccess)

  if (workflowResult == undefined) {
    throw new Error(`Workflow not found with success = ${isSuccess}`)
  }

  const githubWorkflowRun: GithubWorkflowRun = {
    runId: workflowResult.id,
    owner: GITHUB_REPO_OWNER,
    repo: GITHUB_REPO_NAME
  }

  await runNotificationWorkflow(ssmClient, githubWorkflowRun, "github-actions")
}

runLocalWorkflow(true)
// runLocalWorkflow(false)
