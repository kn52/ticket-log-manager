# Ticket Log Manager

A React + Vite app that updates a monthly plain-text log in GitHub from Jira ticket URLs.

## Features

- Shared repository settings with an Add log tab and a Search folders tab for Worklogs, Business files, and today's Todos.
- In Search folders, enter `worklogs`, `business`, or `todos` (or `data/` followed by the folder name) and select **Check**. Worklogs can be filtered by date and subfolder; Business files can be selected from the folder list.
- Daily todo files use `data/todos/DD-MMM-YYYY.txt` with an uppercase month (for example, `data/todos/11-NOV-2026.txt`).
- Checking the `todos` folder automatically deletes only dated todo files older than the latest 7 days. Other files and the Business and Worklogs folders are not affected.
- Reads the selected file from GitHub, or creates it and any missing parent folders if it does not exist.
- Default file naming: `line-MMM-yyyy-logs.txt` (for example, `line-Nov-2026-logs.txt`).
- Data folders are grouped under `data/`, including `data/business/`, `data/todos/`, and `data/worklogs/`.
- Worklogs target path: `data/worklogs/[year folder/][optional folder path/]filename`. For example, year `2026` and folder path `team` produce `data/worklogs/2026/team/line-Nov-2026-logs.txt`.
- Others target path: `data/[folder path/]filename`. For example, folder path `todos` produces a file under `data/todos/`.
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
- Folder path: relative to `data/`. For example, `team` adds `data/team/` to an Others target, or a `team/` subfolder under the Worklogs year folder.

The app writes to the selected branch via GitHub's Contents API. It does not create a pull request.

## Notes

This app uses deterministic retrieval and file updates rather than an LLM-based RAG pipeline. For this task, reading the existing monthly file and matching the date section is more reliable than adding an LLM. A future version could add semantic search across older logs if that is useful.
