import {SSMClient} from "@aws-sdk/client-ssm"
import {getParameter} from "./aws"
import * as github from "@actions/github"
import {type components} from "@octokit/openapi-types"
import {createSlackClient} from "./slack"
import {FailedWorkflowRunDetails, GithubWorkflowRun, WorkflowRunDetails} from "./types"

type GithubJob = components["schemas"]["job"]
type GithubJobStep = NonNullable<GithubJob["steps"]>[number]

export const REPOSITORY_OWNER = "ruchira088"

const FAILED_GITHUB_CONCLUSIONS: ReadonlyArray<string> = ["failure", "timed_out"]

export function isOwnedRepository(repositoryFullName: string | undefined): boolean {
  return repositoryFullName?.split("/")[0] === REPOSITORY_OWNER
}

function hasFailed({conclusion}: GithubJob | GithubJobStep): boolean {
  return conclusion != null && FAILED_GITHUB_CONCLUSIONS.includes(conclusion)
}

export async function runNotificationWorkflow(
  ssmClient: SSMClient,
  githubWorkflowRun: GithubWorkflowRun,
  slackChannel: string
): Promise<void> {
  const githubToken = await getParameter(ssmClient, "/github/slack-github-action/read")

  const octokit = github.getOctokit(githubToken)

  const workflowRunParameters = {
    owner: githubWorkflowRun.owner, repo: githubWorkflowRun.repo, run_id: githubWorkflowRun.runId,
  }

  const jobsForWorkflowRun = await octokit.rest.actions.listJobsForWorkflowRun(workflowRunParameters)

  const failedJob: GithubJob | undefined = jobsForWorkflowRun.data.jobs.find(hasFailed)

  const workflowRun = await octokit.rest.actions.getWorkflowRun(workflowRunParameters)

  const workflowRunDetails: WorkflowRunDetails = {
    repository: workflowRun.data.repository.full_name,
    branch: workflowRun.data.head_branch ?? "unknown",
    commitMessage: workflowRun.data.display_title,
    commitSha: workflowRun.data.head_sha,
    workflowName: workflowRun.data.name ?? "unknown",
    url: workflowRun.data.html_url
  }

  const slackClient = await createSlackClient(ssmClient)

  if (failedJob != null) {
    const failedWorkflowRunDetails: FailedWorkflowRunDetails = {
      ...workflowRunDetails,
      failedJob: failedJob.name,
      failedStep: failedJob.steps?.find(hasFailed)?.name ?? "Unknown step",
      failedStepUrl: failedJob.html_url ?? workflowRunDetails.url
    }
    await slackClient.sendFailureMessage(slackChannel, failedWorkflowRunDetails)
  } else {
    await slackClient.sendSuccessMessage(slackChannel, workflowRunDetails)
  }
}
