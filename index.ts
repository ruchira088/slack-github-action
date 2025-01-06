import core from "@actions/core"
import {context} from "@actions/github"

async function runAction() {
  const awsRoleArn: string = core.getInput("aws-role-arn")
  console.log(JSON.stringify(context, null, 2))

}

runAction()