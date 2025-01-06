import * as core from "@actions/core"
import * as github from "@actions/github"
import {AssumeRoleWithWebIdentityCommand, STSClient} from "@aws-sdk/client-sts"
import {GetParameterCommand, Parameter, SSMClient} from "@aws-sdk/client-ssm"
import {
  AssumeRoleWithWebIdentityCommandOutput
} from "@aws-sdk/client-sts/dist-types/commands/AssumeRoleWithWebIdentityCommand"
import {AwsCredentialIdentity} from "@smithy/types/dist-types/identity/awsCredentialIdentity"
import {GetParameterCommandOutput} from "@aws-sdk/client-ssm/dist-types/commands/GetParameterCommand"

const REPOSITORY_OWNER = "ruchira088"

type GithubWorkflowRun = {
  readonly owner: string
  readonly repo: string
  readonly runId: number
}

async function loginToAws(roleArn: string, region: string, sessionName?: string): Promise<AwsCredentialIdentity> {
  const idToken: string = await core.getIDToken("sts.amazonaws.com")
  const stsClient = new STSClient({region})

  const assumeRoleWithWebIdentityCommand = new AssumeRoleWithWebIdentityCommand({
    RoleArn: roleArn,
    WebIdentityToken: idToken,
    RoleSessionName: sessionName || "SlackGitHubActionOIDC"
  })

  const output: AssumeRoleWithWebIdentityCommandOutput = await stsClient.send(assumeRoleWithWebIdentityCommand)

  if (output.Credentials == undefined || output.Credentials.AccessKeyId == null || output.Credentials.SecretAccessKey == null) {
    throw new Error(`Unable to assume role=${roleArn}, region=${region}`)
  }

  console.log("Authenticated with AWS")

  const awsCredentialIdentity: AwsCredentialIdentity = {
    accessKeyId: output.Credentials.AccessKeyId,
    secretAccessKey: output.Credentials.SecretAccessKey,
    sessionToken: output.Credentials.SessionToken,
  }

  return awsCredentialIdentity
}

function map<T, R>(input: T | undefined, fn: (value: T) => R): R | undefined {
  if (input === undefined) {
    return undefined
  } else {
    return fn(input)
  }
}

async function getParameter(ssmClient: SSMClient, parameterName: string): Promise<string> {
  const getParameterCommand = new GetParameterCommand({Name: parameterName, WithDecryption: true})
  const response: GetParameterCommandOutput = await ssmClient.send(getParameterCommand)

  const parameterValue = (response.Parameter as Parameter).Value as string

  return parameterValue
}

async function run(ssmClient: SSMClient, githubWorkflowRun: GithubWorkflowRun): Promise<void> {
  const slackBotToken = await getParameter(ssmClient, "/github/slack/bot-token")
  const githubToken = await getParameter(ssmClient, "/github/slack-github-action/read")

  const octokit = github.getOctokit(githubToken)

  const response = await octokit.rest.actions.getWorkflowRun({
    owner: githubWorkflowRun.owner, repo: githubWorkflowRun.repo, run_id: githubWorkflowRun.runId,
  })

  const {status, conclusion} = response.data

  console.log({status, conclusion})
}

async function runGitHubAction() {
  const awsRoleArn: string = core.getInput("aws-role-arn")
  const awsRegion: string = core.getInput("aws-region")

  if (github.context.payload.repository?.owner?.name != REPOSITORY_OWNER) {
    throw new Error(`Only repositories owned by ${REPOSITORY_OWNER} can use this GitHub Action.`)
  }

  const awsSessionName: string | undefined = map(github.context.payload.repository?.name, name => `${name}-oidc`)
  const awsCredentials = await loginToAws(awsRoleArn, awsRegion, awsSessionName)

  const ssmClient = new SSMClient({region: awsRegion, credentials: awsCredentials})

  const githubWorkflowRun: GithubWorkflowRun = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    runId: github.context.runId
  }

  await run(ssmClient, githubWorkflowRun)
}

async function runLocal() {
  const ssmClient = new SSMClient({region: "ap-southeast-2"})

  const githubWorkflowRun: GithubWorkflowRun = {
    owner: "ruchira088",
    repo: "slack-github-action",
    runId: 12629623430
    // runId: 12629662712
  }

  await run(ssmClient, githubWorkflowRun)
}

runGitHubAction()
// runLocal()

