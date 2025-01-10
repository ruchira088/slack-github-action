import {SSMClient} from "@aws-sdk/client-ssm"
import {getParameter} from "./aws"
import * as github from "@actions/github"
import {createSlackClient} from "./slack"
import {CommitDetails, GithubWorkflowRun} from "./types"

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

  const workflowRunDetails = await octokit.rest.actions.getWorkflowRun(workflowRunParameters)

  const commitDetails: CommitDetails = {
    repository: workflowRunDetails.data.repository.full_name,
    branch: workflowRunDetails.data.head_branch as string,
    commitMessage: workflowRunDetails.data.display_title,
    commitSha: workflowRunDetails.data.head_sha
  }

  const workflowName: string = workflowRunDetails.data.name as string
  const url = workflowRunDetails.data.html_url

  const slackClient = await createSlackClient(ssmClient)

  if (failedJob != null) {
    const failedStep: string =
      failedJob.steps?.find(step => step.conclusion != null && FAILED_GITHUB_CONCLUSIONS.includes(step.conclusion))?.name as string

    const failedStepUrl = failedJob.html_url as string

    await slackClient.sendFailureMessage(slackChannel, {...commitDetails, workflowName, url, failedStep, failedStepUrl})
  } else {
    await slackClient.sendSuccessMessage(slackChannel, {...commitDetails, workflowName, url})
  }
}