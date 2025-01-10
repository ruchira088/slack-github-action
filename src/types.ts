export type GithubWorkflowRun = {
  readonly owner: string
  readonly repo: string
  readonly runId: number
}

export type CommitDetails = {
  readonly repository: string
  readonly branch: string
  readonly commitMessage: string
  readonly commitSha: string
}

type WorkflowRunDetails = CommitDetails & {
  readonly workflowName: string
  readonly url: string
}

export type SuccessfulWorkflowRunDetails = WorkflowRunDetails

export type FailedWorkflowRunDetails = WorkflowRunDetails & {
  readonly failedStep: string
  readonly failedStepUrl: string
}
