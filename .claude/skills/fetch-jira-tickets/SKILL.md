---
name: fetch-jira-tickets
description: Fetch a Jira epic and all its child tickets (or a list of ticket keys) with full descriptions and acceptance criteria, read-only, and save them to a scratch file for test design. Use whenever test work starts from a WP23-xx key. Uses the Atlassian MCP when this session has it, and falls back to a headless Claude run in the app repo (which has the MCP configured) when it doesn't.
---

# Fetch Jira tickets (read-only)

Output, both in `/tmp/<KEY>-explore/`, for the epic and **every** child:

- `tickets.md`: **verbatim**, never summarised: key, summary, status, type, the full
  description, the full acceptance criteria (usually inside the description; check custom
  fields too), notes/questions, **every comment** (author, date, body), linked tickets.
  Decisions often live in comments (e.g. WP23-159's "requirements still stand" thread).
- `tickets.json`: the same, machine-readable, for the coverage map and the reports. Shape and
  rules are in `scripts/validate-tickets.cjs`; each AC is `{ "id": "AC 1.1", "text": "<verbatim>" }`.

Then validate. Don't start test design on an invalid file:

```bash
node .claude/skills/fetch-jira-tickets/scripts/validate-tickets.cjs /tmp/<KEY>-explore
```

## 1. Atlassian MCP available in this session

Check with `ToolSearch` for `atlassian`. If `getJiraIssue` / `searchJiraIssuesUsingJql` exist:

- Epic: `getJiraIssue` on the key.
- Children: JQL `parent = <EPIC> OR "Epic Link" = <EPIC> ORDER BY key` (both forms — team-managed
  and company-managed projects differ). Page until no more results.
- Fetch each child individually with `fields: ["summary","description","status","issuetype","comment","issuelinks"]`
  and `responseContentFormat: "markdown"`; search results truncate and omit comments.
- Write the tool output's description and comment bodies into the files as they are. Strip
  image `blob:` URLs only.

## 2. Fallback — headless Claude in the app repo

The Atlassian MCP is configured for `../wisersite-and-payload-plugin`, not for this repo. Run a
read-only headless session there and capture its output:

```bash
mkdir -p /tmp/<KEY>-explore
(cd ../wisersite-and-payload-plugin && claude -p "Using the Atlassian Jira MCP tools (read-only), fetch <KEY> and every child issue (JQL: parent = <KEY> OR \"Epic Link\" = <KEY>), each with fields summary, description, status, issuetype, comment, issuelinks. For the epic and EACH child output verbatim: key, summary, status, type, full description, full acceptance criteria (check custom fields too) and every comment with author and date. Do not summarize or omit anything. Do not modify anything in Jira." \
  --allowedTools "mcp__atlassian__getAccessibleAtlassianResources,mcp__atlassian__getJiraIssue,mcp__atlassian__searchJiraIssuesUsingJql" \
  --output-format text > /tmp/<KEY>-explore/tickets.md 2>&1)
```

- Takes 1–5 minutes; use a 600000 ms Bash timeout. There is no `timeout` binary on macOS.
- The subshell keeps this session's working directory in this repo.
- `--allowedTools` lists only the three read tools. A wildcard (`mcp__atlassian__*`) would also
  allow comment/transition/edit tools, so never widen it.
- If the output says the MCP needs auth, stop phase 1 and report that the user must run `/mcp`
  (or `claude` in the app repo) and complete the Atlassian login. Don't guess ACs.

Option 1 should normally be available: this repo's `.mcp.json` registers `atlassian` and
`playwright`. The fallback is for sessions where the server isn't approved or authenticated.

## 3. Read what you fetched — critically

- **Status matters**: `Done` → test it. `Closed` / `Won't Do` → usually superseded; report it,
  don't test it, unless the user asks. Say which later tickets replaced it if that's evident.
- Number every AC **with the ticket's own numbering** (`WP23-87 AC 2.1.3`): the scenario
  matrix, the `ac` annotations on tests and the coverage map all join on these IDs. Never
  renumber. Record gaps and oddities in `numberingNotes` (WP23-87 has no AC 4; WP23-157's
  "Functionality" list becomes `Func 1.2.1`; a struck-out AC stays listed as out of scope).
  A parent line with its own wording ("Headline stats: … shall display") is an AC too.
- Capture Q&A in NOTES ("Does the widget period overrule the global filter? — Yes, contained");
  they are often the real spec.
- Flag ACs that are ambiguous or can't be true for this domain (e.g. "top 6 by Total visitors"
  on an ATS widget) — they become discrepancy rows, not guesses.
- Images and Claude Design links can't be viewed via the API; note them as unverifiable.
