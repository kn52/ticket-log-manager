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


function normalizeUrls(raw) {
  const values = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const invalid = values.filter(value => {
    try {
      const u = new URL(value);
      return u.protocol !== "https:" || !/\/browse\/[A-Z][A-Z0-9]+-\d+\/?$/.test(u.pathname);
    } catch { return true; }
  });
  return { urls: [...new Set(values)], invalid };
}

function updateLog(existing, dateHeading, urls) {
  // Preserve existing content and the required two blank lines between date sections.
  let content = (existing || "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!content) {
    return `${dateHeading}\n++++++++\n${urls.join("\n")}`;
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
    const existingUrls = new Set(section.filter(line => /^https:\/\/\S+$/.test(line.trim())).map(line => line.trim()));
    const additions = urls.filter(url => !existingUrls.has(url));
    if (additions.length === 0) return { content, added: [], duplicates: urls };
    // Insert new URLs at the end of this date section, before any separating blank lines.
    while (section.length && section[section.length - 1].trim() === "") section.pop();
    section.push(...additions);
    lines.splice(dateIndex, end - dateIndex, ...section);
    content = lines.join("\n").replace(/\n+$/, "");
    return { content, added: additions, duplicates: urls.filter(url => existingUrls.has(url)) };
  }

  return { content: `${content}\n\n\n${dateHeading}\n++++++++\n${urls.join("\n")}`, added: urls, duplicates: [] };
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
  const [filePath, setFilePath] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [date, setDate] = useState(todayInIndia());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewContent, setPreviewContent] = useState("");
  const [previewMeta, setPreviewMeta] = useState(null);

  const { urls, invalid } = useMemo(() => normalizeUrls(ticketInput), [ticketInput]);
  const dateParts = useMemo(() => getDateParts(date), [date]);
  const targetPath = [
    "logs",
    String(dateParts.year),
    dateParts.fileName
  ].join("/");
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
    if (!owner || !repo || !token.trim()) {
      setMessage({ type: "error", text: "Enter a valid GitHub repository URL and a GitHub token to load a preview." });
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
      const result = updateLog(existing, dateParts.dateHeading, urls);
      const nextContent = typeof result === "string" ? result : result.content;
      setPreviewContent(nextContent);
      setPreviewMeta({ exists: Boolean(existing), added: result.added ?? urls, duplicates: result.duplicates ?? [], count: urls.length });
      setPreviewOpen(true);
      setMessage({ type: "success", text: existing ? "Existing file loaded and preview prepared." : "Monthly file does not exist yet; a new file will be created." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  
  async function saveToGithub() {
    setMessage(null);
  
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
  
    if (!urls.length) {
      setMessage({
        type: "error",
        text: "Enter at least one Jira ticket URL."
      });
      return;
    }
  
    if (invalid.length) {
      setMessage({
        type: "error",
        text: `These are not valid Jira browse URLs: ${invalid.join(", ")}`
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
  
      // Add today's section or append only new URLs to an existing section.
      const result = updateLog(
        existing,
        dateParts.dateHeading,
        urls
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
          duplicates: urls,
          count: urls.length
        });
  
        setPreviewOpen(true);
        setMessage({
          type: "success",
          text: "No changes needed: all submitted URLs are already logged for this date."
        });
  
        return;
      }
  
      const payload = {
        message: `${sha ? "Update" : "Create"} ${dateParts.fileName} - ${dateParts.dateHeading}`,
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
        added: result.added ?? urls,
        duplicates: result.duplicates ?? [],
        count: urls.length
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
        <div className="brand-copy"><strong>Ticket Log Manager</strong><span>Jira to GitHub · Monthly logs</span></div>
        <div className="top-chip"><span className="status-dot" /> Ready</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line" /> WORKFLOW AUTOMATION</div>
        <h1>Log tickets.<br /><span>Skip the manual work.</span></h1>
        <p>Paste Jira ticket links and update your monthly GitHub text file with the right date section—without duplicate entries.</p>
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
            <div><label htmlFor="path">Folder path <span className="optional">optional</span></label><input id="path" value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="e.g. worklogs/2026" /></div>
          </div>

          <label htmlFor="token">GitHub personal access token</label>
          <div className="token-wrap"><input id="token" type={showToken ? "text" : "password"} value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_••••••••••••" autoComplete="off" /><button className="icon-button" type="button" onClick={() => setShowToken(v => !v)} aria-label={showToken ? "Hide token" : "Show token"}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          <p className="hint">Use a fine-grained token limited to this repository with <b>Contents: Read and write</b>. The token stays in this tab and is not saved by this app.</p>

          <div className="section-divider" />

          <div className="section-heading">
            <div className="step-number">02</div>
            <div><h2>Add Jira tickets</h2><p>One ticket URL per line. Duplicate links are removed.</p></div>
          </div>
          <label htmlFor="tickets">Jira ticket URLs</label>
          <textarea id="tickets" rows={5} value={ticketInput} onChange={e => setTicketInput(e.target.value)} placeholder={"https://your-company.atlassian.net/browse/PROJ-123\nhttps://your-company.atlassian.net/browse/PROJ-124"} />
          <div className="input-footer"><span>{urls.length} unique {urls.length === 1 ? "ticket" : "tickets"}</span>{invalid.length > 0 && <span className="invalid-count">{invalid.length} invalid URL(s)</span>}</div>

          <div className="section-divider" />
          <div className="section-heading compact">
            <div className="step-number">03</div>
            <div><h2>Choose log date</h2><p>Uses India time by default.</p></div>
          </div>
          <div className="date-control"><CalendarDays size={18} /><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="file-target"><FileText size={18} /><div><span>Target file</span><strong>{targetPath}</strong></div><span className="file-tag">.TXT</span></div>

          {message && <div className={`notice ${message.type}`} role="status">{message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{message.text}{message.url && <a href={message.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink size={13} /></a>}</div></div>}

          <div className="actions">
            <button className="secondary-button" onClick={loadPreview} disabled={busy || !urls.length}><Eye size={17} /> Preview update</button>
            <button className="primary-button" onClick={saveToGithub} disabled={busy || !urls.length}>{busy ? <><LoaderCircle className="spin" size={17} /> Working…</> : <><Github size={17} /> Save to GitHub</>}</button>
          </div>
          <p className="security-note"><AlertCircle size={14} /> Review the preview before saving. Saving creates a commit on the selected branch.</p>
        </div>

        <aside className="preview-panel">
          <div className="preview-header"><div><span className="preview-kicker">LIVE PREVIEW</span><h2>Monthly log</h2></div><button className="icon-button" onClick={() => setPreviewOpen(v => !v)} aria-label="Toggle preview">{previewOpen ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          <div className="preview-file"><FileText size={16} /><span>{dateParts.fileName}</span><span className="branch-pill">{branch.trim() || "main"}</span></div>
          {previewOpen && <div className="code-preview">{previewContent ? previewContent.split("\n").map((line, index) => <div className={`code-line ${/^\d{2}-[A-Z][a-z]{2}-\d{4}$/.test(line) ? "date-line" : line === "++++++++" ? "separator-line" : line.startsWith("https://") ? "url-line" : ""}`} key={`${index}-${line}`}>{line || "\u00a0"}</div>) : <div className="empty-preview"><div className="empty-icon"><Link2 size={22} /></div><strong>Your log preview appears here</strong><span>Enter your repository and tickets, then choose Preview update.</span></div>}</div>}
          <div className="rules-card"><strong><CheckCircle2 size={16} /> Formatting rules</strong><ul><li>Date heading: <code>dd-MMM-yyyy</code></li><li>Section divider: <code>++++++++</code></li><li>Exactly two blank lines between date sections</li><li>Ticket URLs listed once per date</li><li>Creates the monthly file if missing</li></ul></div>
          {previewMeta && <div className="preview-stats"><div><span>New links</span><strong>{previewMeta.added.length}</strong></div><div><span>Already logged</span><strong>{previewMeta.duplicates.length}</strong></div></div>}
          <div className="preview-footer"><span className="status-dot" /> Your changes are only committed when you click Save to GitHub.</div>
        </aside>
      </section>
      <footer className="footer"><span>Ticket Log Manager</span><span>React · GitHub Contents API</span></footer>
    </main>
  );
}