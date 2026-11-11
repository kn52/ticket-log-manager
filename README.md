# Ticket Log Manager

A React + Vite app that updates a monthly plain-text log in GitHub from Jira ticket URLs.

## Features

- Reads the selected monthly file from GitHub, or creates it if it does not exist.
- Default file naming: `line-MMM-yyyy-logs.txt` (for example, `line-Nov-2026-logs.txt`).
- Target path: `[folder path/]logs/[optional year folder/]filename`. For example, folder path `work` and year `2026` produce `work/logs/2026/line-Nov-2026-logs.txt`.
- The year folder and custom file name are optional. Without a custom name, the app uses the default name based on the selected log date.
- Date heading format: `dd-MMM-yyyy` (for example, `27-Oct-2026`).
- Section format:
  ```text
  27-Oct-2026
  ++++++++
  https://example.atlassian.net/browse/PROJ-123
  ```
- Uses exactly two blank lines between date sections.
- Adds links to an existing date section or creates a new section.
- Skips duplicate URLs in the same date section.
- For the “Others” log type, writes summary entries directly to the selected file without a date heading, appending only entries that are not already present.
- Defaults the date using the `Asia/Kolkata` timezone.
- Preview before saving; saving creates a commit on the selected branch.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## GitHub token setup

Create a **fine-grained personal access token** in GitHub, limited to the repository you want to update. Grant **Contents: Read and write**. If your organization uses SSO or approval policies, follow those requirements.

Enter the token into the app when using it. The app keeps the token only in React state in the current tab: it does not write it to local storage or send it anywhere except `api.github.com`. Anyone who can inspect or control the browser session may still be able to access it, so use a narrowly scoped token and close the tab when finished. For a shared or public deployment, do not put a GitHub token directly in a browser app; use a backend service that stores credentials securely.

## Repository settings

- Repository: `https://github.com/OWNER/REPO` or `OWNER/REPO`
- Branch: for example `main`
- Folder path: optional, relative to the repository root. For example `work` adds a `work/` prefix before `logs/`.

The app writes to the selected branch via GitHub's Contents API. It does not create a pull request.

## Notes

This app uses deterministic retrieval and file updates rather than an LLM-based RAG pipeline. For this task, reading the existing monthly file and matching the date section is more reliable than adding an LLM. A future version could add semantic search across older logs if that is useful.
