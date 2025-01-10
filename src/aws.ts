import {AwsCredentialIdentity} from "@smithy/types/dist-types/identity/awsCredentialIdentity"
import * as core from "@actions/core"
import {AssumeRoleWithWebIdentityCommand, STSClient} from "@aws-sdk/client-sts"
import {
  AssumeRoleWithWebIdentityCommandOutput
} from "@aws-sdk/client-sts/dist-types/commands/AssumeRoleWithWebIdentityCommand"
import {GetParameterCommand, Parameter, SSMClient} from "@aws-sdk/client-ssm"
import {GetParameterCommandOutput} from "@aws-sdk/client-ssm/dist-types/commands/GetParameterCommand"

export async function getParameter(ssmClient: SSMClient, parameterName: string): Promise<string> {
  const getParameterCommand = new GetParameterCommand({Name: parameterName, WithDecryption: true})
  const response: GetParameterCommandOutput = await ssmClient.send(getParameterCommand)

  const parameterValue = (response.Parameter as Parameter).Value as string

  return parameterValue
}

export async function loginToAws(roleArn: string, region: string, sessionName?: string): Promise<AwsCredentialIdentity> {
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
