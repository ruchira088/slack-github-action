import {AwsCredentialIdentity} from "@smithy/types"
import * as core from "@actions/core"
import {AssumeRoleWithWebIdentityCommand, AssumeRoleWithWebIdentityCommandOutput, STSClient} from "@aws-sdk/client-sts"
import {GetParameterCommand, GetParameterCommandOutput, SSMClient} from "@aws-sdk/client-ssm"

export async function getParameter(ssmClient: SSMClient, parameterName: string): Promise<string> {
  const getParameterCommand = new GetParameterCommand({Name: parameterName, WithDecryption: true})
  const response: GetParameterCommandOutput = await ssmClient.send(getParameterCommand)

  if (response.Parameter == undefined || response.Parameter.Value == undefined) {
    throw new Error(`SSM parameter '${parameterName}' not found or has no value`)
  }

  return response.Parameter.Value
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
