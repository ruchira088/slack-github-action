# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GitHub Action (`action.yml` → `dist/index.js`, Node 24) that posts a Slack Block Kit message summarising the current workflow run. It authenticates to AWS via GitHub OIDC, pulls the GitHub and Slack tokens from SSM Parameter Store, inspects the run via Octokit, and posts to Slack. Hard-gated to repositories owned by `ruchira088` (`REPOSITORY_OWNER` in `src/github.ts`).

## Commands

```bash
npm run lint          # oxlint, type-aware
npm run typecheck     # tsc --noEmit
npm test              # jest (all tests)
npx jest src/slack.test.ts            # one file
npx jest -t 'should paginate'         # tests matching a name
npm run build         # esbuild → dist/index.js (must be committed)
npm run local         # run against REAL AWS/GitHub/Slack using your local AWS creds
```

CI (`.github/workflows/pipeline.yml`) runs lint → typecheck → test → build, then `diff`s the fresh build against the committed `dist/index.js`.

## Rules that CI enforces

- **Rebuild and commit `dist/index.js` after any `src/` change.** CI fails if the committed bundle is stale.
- **Bump `version` in `package.json` to publish.** Every push to `main` creates a GitHub release `v<version>` and force-moves the `v<major>` tag; if that release already exists the release job is a no-op, so an un-bumped push ships nothing.
- oxlint errors on `any` and non-null assertions (`!`). Type assertions (`as`) are allowed; prefer `?? fallback` for nullable API fields.
- Secrets read from SSM go through `getParameter`, which calls `core.setSecret` so they are masked in the Actions log; keep it that way for any new parameter.

## Architecture

Data flow, one function per module:

1. `src/index.ts` — entry. Reads action inputs, checks repo owner, calls `loginToAws` (OIDC token → STS `AssumeRoleWithWebIdentity`), builds an `SSMClient`, and hands off to `runNotificationWorkflow`. **Executes on import**, so it is not unit-testable; keep it thin and put logic in the modules below.
2. `src/aws.ts` — `loginToAws`, `getParameter` (SSM `WithDecryption`). Parameter paths: `/github/slack-github-action/read` (GitHub PAT), `/github/slack/bot-token`.
3. `src/github.ts` — `runNotificationWorkflow`: fetches jobs + run via Octokit, finds the first job with conclusion `failure`/`timed_out`, builds `WorkflowRunDetails` / `FailedWorkflowRunDetails` (`src/types.ts`), and dispatches to the Slack client.
4. `src/slack.ts` — `SlackClient` over axios. Resolves channel *name* → ID by paginating `conversations.list` (capped at 50 pages), then `chat.postMessage` with a `SlackMessage` (`text` fallback + Block Kit section `fields`, built by `buildMessage`).

`src/local-index.ts` is a separate esbuild entry (`npm run local`) that skips OIDC and uses the default AWS credential chain; it picks a recent run from `ruchira088/dynamic-dns` and sends a real Slack message.

## Testing conventions

- Jest + `@swc/jest`; tests live beside sources as `src/*.test.ts`.
- `@actions/core` and `@actions/github` are redirected globally to `src/__mocks__/@actions/*.js` via `moduleNameMapper` — no `jest.mock()` needed, just import and set `mockReturnValue` / mutate `github.context`.
- `./aws`, `./slack`, `axios`, and `@aws-sdk/client-*` are mocked per-file with `jest.mock(...)`.
- `resetMocks: true` — mock implementations are cleared between tests, so set return values in `beforeEach`, not at module scope.
