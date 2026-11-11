import React, { useMemo, useState } from "react";
import { Github, FileText, Link2, CalendarDays, CheckCircle2, AlertCircle, Eye, EyeOff, LoaderCircle, ExternalLink } from "lucide-react";

const API = "https://api.github.com";
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());


function getDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  const shortMonths = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  return {
    year,
    monthNumber: month,
    dateHeading: `${String(day).padStart(2, "0")}-${shortMonths[month - 1]}-${year}`,
    fileName: `line-${shortMonths[month - 1]}-${year}-logs.txt`
  };
}


function normalizeEntries(raw) {
  const values = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return [...new Set(values)];
}

function updateLog(existing, dateHeading, entries, logType) {
  // Preserve existing content and the required two blank lines between date sections.
  let content = (existing || "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!entries.length) return { content, added: [], duplicates: [] };

  if (logType === "others") {
    const existingEntries = new Set(content.split("\n").map(line => line.trim()).filter(Boolean));
    const additions = entries.filter(entry => !existingEntries.has(entry));
    if (additions.length === 0) return { content, added: [], duplicates: entries };
    return {
      content: content ? `${content}\n${additions.join("\n")}` : additions.join("\n"),
      added: additions,
      duplicates: entries.filter(entry => existingEntries.has(entry))
    };
  }

  if (!content) {
    return `${dateHeading}\n++++++++\n${entries.join("\n")}`;
  }

  const lines = content.split("\n");
  const dateIndex = lines.findIndex(line => line.trim() === dateHeading);
  if (dateIndex >= 0) {
    let end = lines.length;
    for (let i = dateIndex + 1; i < lines.length; i++) {
      if (/^\d{2}-[A-Z][a-z]{2}-\d{4}$/.test(lines[i].trim())) {
        end = i;
        break;
      }
    }
    const section = lines.slice(dateIndex, end);
    const existingEntries = new Set(section.map(line => line.trim()).filter(line => line && line !== dateHeading && line !== "++++++++"));
    const additions = entries.filter(entry => !existingEntries.has(entry));
    if (additions.length === 0) return { content, added: [], duplicates: entries };
    // Insert new entries at the end of this date section, before any separating blank lines.
    while (section.length && section[section.length - 1].trim() === "") section.pop();
    section.push(...additions);
    lines.splice(dateIndex, end - dateIndex, ...section);
    content = lines.join("\n").replace(/\n+$/, "");
    return { content, added: additions, duplicates: entries.filter(entry => existingEntries.has(entry)) };
  }

  return { content: `${content}\n\n\n${dateHeading}\n++++++++\n${entries.join("\n")}`, added: entries, duplicates: [] };
}

function decodeContent(encoded) {
  const binary = atob(encoded.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

export default function App() {
  const [ownerRepo, setOwnerRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [logType, setLogType] = useState("");
  const [filePath, setFilePath] = useState("");
  const [yearFolder, setYearFolder] = useState("");
  const [customFileName, setCustomFileName] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [date, setDate] = useState(todayInIndia());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewContent, setPreviewContent] = useState("");
  const [previewMeta, setPreviewMeta] = useState(null);
  const [showValidation, setShowValidation] = useState(false);

  const entries = useMemo(() => normalizeEntries(ticketInput), [ticketInput]);
  const dateParts = useMemo(() => getDateParts(date), [date]);
  const folderPathParts = filePath.trim().split(/[\\/]+/).filter(Boolean);
  const targetFileName = logType === "worklogs"
    ? (customFileName.trim() || dateParts.fileName)
    : (customFileName.trim()
        ? `${customFileName.trim().replace(/\.txt$/i, "")}${yearFolder.trim() ? `-${yearFolder.trim()}` : ""}.txt`
        : "");

  const targetPath = logType === "worklogs"
    ? ["worklogs", yearFolder.trim(), ...folderPathParts, targetFileName].filter(Boolean).join("/")
    : [...folderPathParts, targetFileName].filter(Boolean).join("/");

  const validationErrors = {
    logType: !logType
      ? "Select a log type."
      : "",
    yearFolder: logType === "worklogs" && !yearFolder.trim()
      ? "Year is required for Worklogs."
      : yearFolder.trim() && !/^\d{4}$/.test(yearFolder.trim())
        ? "Enter a valid 4-digit year."
        : "",
    filePath: logType === "others" && !filePath.trim()
      ? "Folder path is required for Others."
      : "",
    customFileName: logType === "others" && !customFileName.trim()
      ? "File name is required for Others."
      : ""
  };
  const hasValidationErrors = Object.values(validationErrors).some(Boolean);
  const repoMatch = ownerRepo.trim().match(/^(?:https:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+)\/?$/);
  const owner = repoMatch?.[1];
  const repo = repoMatch?.[2]?.replace(/\.git$/, "");

  
  async function githubRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });
  
    const data = response.status === 204
      ? null
      : await response.json().catch(() => null);
  
    if (!response.ok) {
      const error = new Error(
        data?.message || `GitHub API error (${response.status})`
      );
      error.status = response.status;
      throw error;
    }
  
    return data;
  }

  async function loadPreview() {
    setMessage(null);
    setShowValidation(true);
    if (hasValidationErrors) {
      setMessage({ type: "error", text: "Please fix the highlighted required fields." });
      return;
    }

    const draftResult = updateLog("", dateParts.dateHeading, entries, logType);
    const draftContent = typeof draftResult === "string" ? draftResult : draftResult.content;
    setPreviewContent(draftContent);
    setPreviewMeta({
      exists: false,
      added: draftResult.added ?? entries,
      duplicates: draftResult.duplicates ?? [],
      count: entries.length
    });
    setPreviewOpen(true);

    if (!owner || !repo || !token.trim()) {
      setMessage({ type: "error", text: "Showing a draft preview. Enter a valid GitHub repository and token to fetch the existing file." });
      return;
    }
    setBusy(true);
    try {
      const encodedPath = targetPath.split("/").map(encodeURIComponent).join("/");
      let existing = "";
      try {
        const data = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch.trim() || "main")}`);
        if (Array.isArray(data)) throw new Error("The target path is a directory, not a text file.");
        existing = decodeContent(data.content || "");
      } catch (error) {
        if (!String(error.message).includes("Not Found") && !String(error.message).includes("404")) throw error;
      }
      const result = updateLog(existing, dateParts.dateHeading, entries, logType);
      const nextContent = typeof result === "string" ? result : result.content;
      setPreviewContent(nextContent);
      setPreviewMeta({ exists: Boolean(existing), added: result.added ?? entries, duplicates: result.duplicates ?? [], count: entries.length });
      setPreviewOpen(true);
      setMessage({ type: "success", text: existing ? "Existing file loaded and preview prepared." : "File does not exist yet; a new file will be created." });
    } catch (error) {
      setMessage({ type: "error", text: `Could not fetch the existing file. Showing the draft preview only. ${error.message}` });
    } finally {
      setBusy(false);
    }
  }

  
  async function saveToGithub() {
    setMessage(null);
    setShowValidation(true);

    if (hasValidationErrors) {
      setMessage({ type: "error", text: "Please fix the highlighted required fields." });
      return;
    }
  
    if (!owner || !repo) {
      setMessage({
        type: "error",
        text: "Enter a valid GitHub repository URL."
      });
      return;
    }
  
    if (!token.trim()) {
      setMessage({
        type: "error",
        text: "Enter a GitHub token with repository Contents read/write permission."
      });
      return;
    }
  
    if (!entries.length) {
      setMessage({
        type: "error",
        text: "Enter at least one Jira ticket or summary detail."
      });
      return;
    }
  
    setBusy(true);
  
    try {
      const ref = branch.trim() || "main";
  
      // Build the complete path, including the year folder.
      const encodedPath = targetPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
  
      let existing = "";
      let sha;
  
      // Read the existing file, if present.
      try {
        const data = await githubRequest(
          `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
        );
  
        if (Array.isArray(data)) {
          throw new Error(
            "The target path is a directory, not a text file."
          );
        }
  
        existing = decodeContent(data.content || "");
        sha = data.sha;
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }
  
        // File does not exist; create it using the PUT request below.
        existing = "";
        sha = undefined;
      }
  
      // Add today's section or append only new entries to an existing section.
      const result = updateLog(
        existing,
        dateParts.dateHeading,
        entries,
        logType
      );
  
      const content = typeof result === "string"
        ? result
        : result.content;
  
      // Avoid creating unnecessary commits when nothing changed.
      if (existing && content === existing) {
        setPreviewContent(content);
        setPreviewMeta({
          exists: true,
          added: [],
          duplicates: entries,
          count: entries.length
        });
  
        setPreviewOpen(true);
        setMessage({
          type: "success",
          text: "No changes needed: all submitted entries are already in the file."
        });
  
        return;
      }
  
      const payload = {
        message: `${sha ? "Update" : "Create"} ${targetFileName} - ${dateParts.dateHeading}`,
        content: encodeContent(content),
        branch: ref
      };
  
      // GitHub requires the existing file SHA for updates.
      // Do not include SHA when creating a new file.
      if (sha) {
        payload.sha = sha;
      }
  
      // GitHub creates missing directories and the file automatically.
      const saved = await githubRequest(
        `/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
  
      setPreviewContent(content);
  
      setPreviewMeta({
        exists: Boolean(sha),
        added: result.added ?? entries,
        duplicates: result.duplicates ?? [],
        count: entries.length
      });
  
      setPreviewOpen(true);
  
      const fileUrl =
        saved.content?.html_url ||
        `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encodedPath}`;
  
      setMessage({
        type: "success",
        text: `${sha ? "Updated" : "Created"} ${targetPath} successfully.`,
        url: fileUrl
      });
  
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Failed to save the log to GitHub."
      });
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><FileText size={22} /></div>
        <div className="brand-copy"><strong>Ticket Log Manager</strong><span>Jira/Details to GitHub · logs</span></div>
        <div className="top-chip"><span className="status-dot" /> Ready</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line" /> WORKFLOW AUTOMATION</div>
        <h1>Logs.<br /><span>Skip the manual work.</span></h1>
        <p>Paste Jira links or summaries and update your GitHub text file with the right date section—without duplicate entries.</p>
      </section>

      <section className="workspace">
        <div className="form-panel">
          <div className="section-heading">
            <div className="step-number">01</div>
            <div><h2>Connect your repository</h2><p>Choose where the monthly log should live.</p></div>
          </div>

          <label htmlFor="repo">GitHub repository URL</label>
          <div className="input-with-icon"><Github size={17} /><input id="repo" value={ownerRepo} onChange={e => setOwnerRepo(e.target.value)} placeholder="https://github.com/owner/repository" autoComplete="off" /></div>

          <div className="two-col">
            <div><label htmlFor="branch">Branch</label><input id="branch" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" /></div>
            <div>
              <label htmlFor="log-type">Log type</label>
              <select id="log-type" value={logType} onChange={e => { setLogType(e.target.value); setShowValidation(false); }}>
                <option value="" disabled>Select log type</option>
                <option value="worklogs">Worklogs</option>
                <option value="others">Others</option>
              </select>
              {showValidation && validationErrors.logType && <span className="invalid-count" role="alert">{validationErrors.logType}</span>}
            </div>
          </div>
          <div className="path-section">
            <label htmlFor="path">Folder path <span className="optional">{logType === "worklogs" ? "optional" : "required"}</span></label>
            <input id="path" value={filePath} onChange={e => setFilePath(e.target.value)} placeholder={logType === "worklogs" ? "Optional, e.g. project" : "Required, e.g. project"} aria-invalid={showValidation && Boolean(validationErrors.filePath)} style={showValidation && validationErrors.filePath ? { borderColor: "#dc2626" } : undefined} />
            {showValidation && validationErrors.filePath && <span className="invalid-count" role="alert">{validationErrors.filePath}</span>}
          </div>

          <div className="token-section">
            <label htmlFor="token">GitHub personal access token</label>
            <div className="token-wrap"><input id="token" type={showToken ? "text" : "password"} value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your GitHub token" autoComplete="off" /><button className="icon-button" type="button" onClick={() => setShowToken(v => !v)} aria-label={showToken ? "Hide token" : "Show token"}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            <p className="hint">Use a fine-grained token limited to this repository with <b>Contents: Read and write</b>. The token stays in this tab and is not saved by this app.</p>
          </div>

          <div className="section-divider" />

          <div className="section-heading">
            <div className="step-number">02</div>
            <div><h2>Add log details</h2><p>Enter the details to include in this log.</p></div>
          </div>
          <label htmlFor="tickets">Jira ticket / summary details</label>
          <textarea id="tickets" rows={5} value={ticketInput} onChange={e => setTicketInput(e.target.value)} placeholder={"Enter a Jira URL or a summary, for example:\nhttps://your-domain.atlassian.net/browse/PROJ-123\nInvestigated the issue and updated the workflow"} />
          <div className="input-footer"><span>{entries.length} unique {entries.length === 1 ? "entry" : "entries"}</span></div>

          <div className="section-divider" />
          <div className="section-heading compact">
            <div className="step-number">03</div>
            <div><h2>Choose log date</h2><p>Uses India time by default.</p></div>
          </div>
          <div className="date-control"><CalendarDays size={18} /><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="two-col file-options">
            <div>
              <label htmlFor="year-folder">Year <span className="optional">{logType === "worklogs" ? "required" : "optional"}</span></label>
              <input id="year-folder" type="text" value={yearFolder} onChange={e => setYearFolder(e.target.value)} placeholder="e.g. 2026" aria-invalid={showValidation && Boolean(validationErrors.yearFolder)} style={showValidation && validationErrors.yearFolder ? { borderColor: "#dc2626" } : undefined} />
              {showValidation && validationErrors.yearFolder && <span className="invalid-count" role="alert">{validationErrors.yearFolder}</span>}
            </div>
            <div>
              <label htmlFor="file-name">File name <span className="optional">{logType === "worklogs" ? "optional" : "required"}</span></label>
              <input id="file-name" value={customFileName} onChange={e => setCustomFileName(e.target.value)} placeholder={logType === "worklogs" ? dateParts.fileName : "Enter file name"} aria-invalid={showValidation && Boolean(validationErrors.customFileName)} style={showValidation && validationErrors.customFileName ? { borderColor: "#dc2626" } : undefined} />
              {showValidation && validationErrors.customFileName && <span className="invalid-count" role="alert">{validationErrors.customFileName}</span>}
            </div>
          </div>
          <div className="file-target"><FileText size={18} /><div><span>Target file</span><strong>{targetPath}</strong></div><span className="file-tag">{targetFileName.includes(".") ? targetFileName.split(".").pop().toUpperCase() : "FILE"}</span></div>

          {message && <div className={`notice ${message.type}`} role="status">{message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{message.text}{message.url && <a href={message.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink size={13} /></a>}</div></div>}

          <div className="actions">
            <button className="secondary-button" onClick={loadPreview} disabled={busy}><Eye size={17} /> Preview update</button>
            <button className="primary-button" onClick={saveToGithub} disabled={busy || !entries.length}>{busy ? <><LoaderCircle className="spin" size={17} /> Working…</> : <><Github size={17} /> Save to GitHub</>}</button>
          </div>
          <p className="security-note"><AlertCircle size={14} /> Review the preview before saving. Saving creates a commit on the selected branch.</p>
        </div>

        <aside className="preview-panel">
          <div className="preview-header"><div><span className="preview-kicker">LIVE PREVIEW</span><h2>Detailed log</h2></div><button className="icon-button" onClick={() => setPreviewOpen(v => !v)} aria-label="Toggle preview">{previewOpen ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          <div className="preview-file"><FileText size={16} /><span>{targetFileName || "Select a log type"}</span><span className="branch-pill">{branch.trim() || "main"}</span></div>
          {previewOpen && <div className="code-preview">{previewContent ? previewContent.split("\n").map((line, index) => <div className={`code-line ${/^\d{2}-[A-Z][a-z]{2}-\d{4}$/.test(line) ? "date-line" : line === "++++++++" ? "separator-line" : line.startsWith("https://") ? "url-line" : ""}`} key={`${index}-${line}`}>{line || "\u00a0"}</div>) : <div className="empty-preview"><div className="empty-icon"><Link2 size={22} /></div><strong>Your log preview appears here</strong><span>Enter your repository and details, then choose Preview update.</span></div>}</div>}
          <div className="rules-card"><strong><CheckCircle2 size={16} /> Formatting rules</strong><ul><li>Date heading: <code>dd-MMM-yyyy</code></li><li>Section divider: <code>++++++++</code></li><li>Exactly two blank lines between date sections</li><li>Entries listed once per date</li><li>Creates the monthly file if missing</li></ul></div>
          {previewMeta && <div className="preview-stats"><div><span>New entries</span><strong>{previewMeta.added.length}</strong></div><div><span>Already logged</span><strong>{previewMeta.duplicates.length}</strong></div></div>}
          <div className="preview-footer"><span className="status-dot" /> Your changes are only committed when you click Save to GitHub.</div>
        </aside>
      </section>
      <footer className="footer"><span>Ticket Log Manager</span><span>React · GitHub Contents API</span></footer>
    </main>
  );
}