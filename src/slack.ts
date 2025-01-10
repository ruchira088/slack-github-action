import axios, {AxiosInstance} from "axios"
import {SSMClient} from "@aws-sdk/client-ssm"
import {getParameter} from "./aws"
import {FailedWorkflowRunDetails, SuccessfulWorkflowRunDetails} from "./types"

export class SlackClient {
  readonly axiosInstance: AxiosInstance

  constructor(apiToken: string) {
    this.axiosInstance = axios.create({
      baseURL: 'https://slack.com/api/',
      headers: {
        "Authorization": `Bearer ${apiToken}`,
      }
    })
  }

  async sendFailureMessage(channelName: string, failedWorkflowRunDetails: FailedWorkflowRunDetails) {
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Repository*:\t   ${failedWorkflowRunDetails.repository}
*Branch*:\t\t\t  ${failedWorkflowRunDetails.branch}
*Message*:\t\t   ${failedWorkflowRunDetails.commitMessage}
*Commit SHA*:   \`${failedWorkflowRunDetails.commitSha}\`
*Workflow*:\t\t ${failedWorkflowRunDetails.workflowName}
*Failed Step*:\t   ${failedWorkflowRunDetails.failedStep}
*Result*:\t\t\t    FAILED :x:
<${failedWorkflowRunDetails.failedStepUrl}|Failed Step URL>`
        }
      }
    ]

    return this.sendMessage(channelName, blocks)
  }

  async sendSuccessMessage(channelName: string, successfulWorkflowRunDetails: SuccessfulWorkflowRunDetails) {
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Repository*:\t   ${successfulWorkflowRunDetails.repository}
*Branch*:\t\t\t  ${successfulWorkflowRunDetails.branch}
*Message*:\t\t   ${successfulWorkflowRunDetails.commitMessage}
*Commit SHA*:   \`${successfulWorkflowRunDetails.commitSha}\`
*Workflow*:\t\t ${successfulWorkflowRunDetails.workflowName}
*Result*:\t\t\t\tSUCCESS :white_check_mark:
<${successfulWorkflowRunDetails.url}|Job URL>`
        }
      }
    ]

    return this.sendMessage(channelName, blocks)
  }

  async sendMessage(channelName: string, blocks: object[]) {
    const channel = await this.getChannelId(channelName)

    if (channel == undefined) {
      throw new Error(`Channel name: ${channelName} not found`)
    }

    const response = await this.axiosInstance.post(
      "/chat.postMessage",
      {channel, blocks}, {
        headers: {
          "Content-Type": "application/json"
        }
      }
    )

    if (response.data.ok) {
      console.log("Slack message sent")
    } else {
      console.error("Failed to send Slack message")
    }
  }

  async getChannelId(channelName: string, cursor?: string): Promise<string | undefined> {
    const queryParams: Record<string, string | number | undefined> = {cursor}

    const queryString =
      Object.keys(queryParams)
        .filter(key => queryParams[key] != undefined)
        .map(key => key + "=" + queryParams[key])
        .join("&")

    const response = await this.axiosInstance.get("/conversations.list?" + queryString)
    if (response.data.ok) {
      const channels: { id: string, name: string }[] = response.data.channels
      const responseMetadata = response.data.response_metadata

      const channel = channels.find(({name}) => name === channelName)

      if (channel != undefined) {
        return channel.id
      } else if (responseMetadata?.next_cursor != undefined) {
        return this.getChannelId(channelName, responseMetadata.next_cursor)
      } else {
        return undefined
      }
    } else {
      throw new Error(response.data.error)
    }
  }
}

export async function createSlackClient(ssmClient: SSMClient) {
  const slackBotToken = await getParameter(ssmClient, "/github/slack/bot-token")
  return new SlackClient(slackBotToken)
}