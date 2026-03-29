const github = {
  context: {
    payload: {},
    eventName: '',
    sha: '',
    ref: '',
    workflow: '',
    action: '',
    actor: '',
    runId: 0,
    repo: { owner: '', repo: '' },
    issue: { owner: '', repo: '', number: 0 },
  },
  getOctokit: jest.fn(),
}

module.exports = github
