import axios, {AxiosInstance} from "axios"
import {SSMClient} from "@aws-sdk/client-ssm"
import {getParameter} from "./aws"
import {FailedWorkflowRunDetails, SuccessfulWorkflowRunDetails, WorkflowRunDetails} from "./types"

export interface SlackMessage {
  /** Plain-text fallback used for notifications, screen readers and clients that cannot render blocks. */
  readonly text: string
  readonly blocks: object[]
}

interface MessageOutcome {
  readonly result: string
  readonly summary: string
  readonly extraFields: MarkdownField[]
  readonly link: { readonly url: string, readonly label: string }
}

type MarkdownField = { readonly type: "mrkdwn", readonly text: string }

function field(label: string, value: string): MarkdownField {
  return {type: "mrkdwn", text: `*${label}*\n${value}`}
}

function buildMessage(details: WorkflowRunDetails, outcome: MessageOutcome): SlackMessage {
  const fields: MarkdownField[] = [
    field("Repository", details.repository),
    field("Branch", details.branch),
    field("Message", details.commitMessage),
    field("Commit SHA", `\`${details.commitSha}\``),
    field("Workflow", details.workflowName),
    field("Result", outcome.result),
    ...outcome.extraFields
  ]

  return {
    text: `${details.workflowName} ${outcome.summary} for ${details.repository} (${details.branch})`,
    blocks: [
      {type: "section", fields},
      {type: "section", text: {type: "mrkdwn", text: `<${outcome.link.url}|${outcome.link.label}>`}}
    ]
  }
}

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

  async sendFailureMessage(channelName: string, details: FailedWorkflowRunDetails) {
    const message = buildMessage(details, {
      result: "FAILED :x:",
      summary: `FAILED (${details.failedJob} / ${details.failedStep})`,
      extraFields: [field("Failed Job", details.failedJob), field("Failed Step", details.failedStep)],
      link: {url: details.failedStepUrl, label: "Failed Step URL"}
    })

    return this.sendMessage(channelName, message)
  }

  async sendSuccessMessage(channelName: string, details: SuccessfulWorkflowRunDetails) {
    const message = buildMessage(details, {
      result: "SUCCESS :white_check_mark:",
      summary: "SUCCESS",
      extraFields: [],
      link: {url: details.url, label: "Job URL"}
    })

    return this.sendMessage(channelName, message)
  }

  async sendMessage(channelName: string, message: SlackMessage) {
    const channel = await this.getChannelId(channelName)

    if (channel == undefined) {
      throw new Error(`Channel name: ${channelName} not found`)
    }

    const response = await this.axiosInstance.post(
      "/chat.postMessage",
      {channel, text: message.text, blocks: message.blocks}, {
        headers: {
          "Content-Type": "application/json"
        }
      }
    )

    if (response.data.ok) {
      console.log("Slack message sent")
    } else {
      throw new Error(`Failed to send Slack message: ${response.data.error ?? 'unknown error'}`)
    }
  }

  async getChannelId(channelName: string, cursor?: string, pageNumber?: number): Promise<string | undefined> {
    const currentPage = pageNumber ?? 0

    if (currentPage > 50) {
      throw new Error("Maximum number of pages reached")
    }

    const response = await this.axiosInstance.get("/conversations.list", {
      params: {limit: 1000, exclude_archived: true, cursor}
    })

    if (response.data.ok) {
      const channels: { id: string, name: string }[] = response.data.channels
      const responseMetadata = response.data.response_metadata

      const channel = channels.find(({name}) => name === channelName)

      if (channel != undefined) {
        return channel.id
      } else if (responseMetadata?.next_cursor) {
        return this.getChannelId(channelName, responseMetadata.next_cursor, currentPage + 1)
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
