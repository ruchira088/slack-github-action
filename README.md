# Slack GitHub Action

A GitHub Action that sends Slack notifications about the results of GitHub Actions workflows. It provides rich, formatted messages with detailed information about workflow runs, including specific failure details when builds fail.

## Features

- Sends formatted Slack notifications for workflow success and failure
- Displays repository, branch, commit message, and SHA
- For failed workflows, identifies the specific failed job and step with a direct link
- Uses AWS OIDC for secure, credential-free authentication
- Retrieves secrets securely from AWS SSM Parameter Store

## Prerequisites

### AWS Setup

1. **IAM Role with OIDC Trust Policy**

   Create an IAM role that trusts GitHub's OIDC provider:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:<GITHUB_ORG>/*:*"
           }
         }
       }
     ]
   }
   ```

2. **IAM Policy for SSM Access**

   Attach a policy allowing the role to read SSM parameters:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ssm:GetParameter"],
         "Resource": [
           "arn:aws:ssm:<REGION>:<AWS_ACCOUNT_ID>:parameter/github/slack/*",
           "arn:aws:ssm:<REGION>:<AWS_ACCOUNT_ID>:parameter/github/slack-github-action/*"
         ]
       }
     ]
   }
   ```

3. **SSM Parameters**

   Create the following SSM SecureString parameters:

   | Parameter Path | Description |
   |----------------|-------------|
   | `/github/slack/bot-token` | Slack Bot OAuth Token (starts with `xoxb-`) |
   | `/github/slack-github-action/read` | GitHub Personal Access Token with `repo` scope |

### Slack Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Add the following OAuth scopes under **OAuth & Permissions**:
   - `channels:read` - To find channel IDs
   - `chat:write` - To send messages
3. Install the app to your workspace
4. Copy the **Bot User OAuth Token** and store it in SSM at `/github/slack/bot-token`
5. Invite the bot to the channel where you want notifications

## Usage

Add the action to your workflow, typically as the last job that runs regardless of previous job results:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches:
      - "**"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm run build

  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - name: Test
        run: npm test

  notify:
    runs-on: ubuntu-latest
    if: always()
    needs:
      - build
      - test
    permissions:
      id-token: write  # Required for OIDC authentication
    steps:
      - name: Send Slack notification
        uses: ruchira088/slack-github-action@v1
        with:
          slack-channel: "github-actions"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `aws-role-arn` | ARN of the AWS IAM role to assume via OIDC | No | `arn:aws:iam::365562660444:role/github_iam_role` |
| `aws-region` | AWS region where SSM parameters are stored | No | `ap-southeast-2` |
| `slack-channel` | Name of the Slack channel (without #) | No | `github-actions` |

## Notification Examples

### Success Notification

```
Repository:    ruchira088/my-project
Branch:        main
Message:       Add new feature
Commit SHA:    abc1234
Workflow:      CI/CD Pipeline
Result:        SUCCESS ✅
Job URL
```

### Failure Notification

```
Repository:    ruchira088/my-project
Branch:        feature/new-feature
Message:       Update dependencies
Commit SHA:    def5678
Workflow:      CI/CD Pipeline
Result:        FAILED ❌
Failed Job:    test
Failed Step:   Run tests
Failed Step URL
```

## How It Works

1. The action authenticates with AWS using OIDC (no static credentials required)
2. It retrieves the Slack bot token and GitHub token from AWS SSM Parameter Store
3. Using the GitHub token, it fetches details about the current workflow run
4. It determines if the workflow succeeded or failed, identifying the specific failed job/step if applicable
5. It sends a formatted message to the specified Slack channel

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Lint the code
npx eslint src
```

### Project Structure

```
├── src/
│   ├── index.ts       # Main entry point
│   ├── aws.ts         # AWS authentication and SSM operations
│   ├── github.ts      # GitHub API interactions
│   ├── slack.ts       # Slack API client
│   ├── types.ts       # TypeScript type definitions
│   └── helpers.ts     # Utility functions
├── dist/              # Compiled output (committed for GitHub Actions)
├── action.yml         # Action metadata
└── package.json
```

### Building

The action is bundled using [@vercel/ncc](https://github.com/vercel/ncc) to create a self-contained distribution:

```bash
npm run build
```

This compiles TypeScript and bundles all dependencies into the `dist/` directory.

## License

ISC License - see [package.json](./package.json) for details.

## Author

Ruchira (Richie) Jayasekara - [me@ruchij.com](mailto:me@ruchij.com)
