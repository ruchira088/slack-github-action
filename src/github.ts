import {SSMClient} from "@aws-sdk/client-ssm"
import {getParameter} from "./aws"
import * as github from "@actions/github"
import {createSlackClient} from "./slack"
import {FailedWorkflowRunDetails, GithubWorkflowRun, WorkflowRunDetails} from "./types"

export const REPOSITORY_OWNER = "ruchira088"

const FAILED_GITHUB_CONCLUSIONS = ["failure", "timed_out"]

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

  const failedJob =
    jobsForWorkflowRun.data.jobs
      .find(job => job.conclusion != null && FAILED_GITHUB_CONCLUSIONS.includes(job.conclusion))

  const workflowRun = await octokit.rest.actions.getWorkflowRun(workflowRunParameters)

  const workflowRunDetails: WorkflowRunDetails = {
    repository: workflowRun.data.repository.full_name,
    branch: workflowRun.data.head_branch as string,
    commitMessage: workflowRun.data.display_title,
    commitSha: workflowRun.data.head_sha,
    workflowName: workflowRun.data.name as string,
    url: workflowRun.data.html_url
  }

  const slackClient = await createSlackClient(ssmClient)

  if (failedJob != null) {
    const failedStep: string =
      failedJob.steps?.find(step => step.conclusion != null && FAILED_GITHUB_CONCLUSIONS.includes(step.conclusion))?.name as string

    const failedWorkflowRunDetails: FailedWorkflowRunDetails = {
      ...workflowRunDetails,
      failedJob: failedJob.name,
      failedStep: failedStep,
      failedStepUrl: failedJob.html_url as string
    }
    await slackClient.sendFailureMessage(slackChannel, failedWorkflowRunDetails)
  } else {
    await slackClient.sendSuccessMessage(slackChannel, workflowRunDetails)
  }
}