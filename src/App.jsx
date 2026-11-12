import React, { useMemo, useState } from "react";
import { Github, FileText, Link2, CalendarDays, CheckCircle2, AlertCircle, Eye, EyeOff, LoaderCircle, ExternalLink, Search, RotateCcw, Eraser, Copy, FolderTree, X } from "lucide-react";

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

function ensureTxtExtension(fileName) {
  return /\.txt$/i.test(fileName) ? fileName : `${fileName}.txt`;
}

function getTodoTaskFileName(dateString, name = "") {
  const prefix = name.trim().replace(/\.txt$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefix ? `${prefix}__` : ""}${getDateParts(dateString).dateHeading}-todo-task.txt`;
}

function getTodoFileDate(fileName) {
  const match = fileName.match(/^(?:.+[_-])?(\d{2})-([A-Z]{3})-(\d{4})(?:-todo-task)?\.txt$/i);
  if (!match) return null;

  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = months.indexOf(match[2].toUpperCase());
  if (month < 0) return null;

  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) {
    return null;
  }
  return date;
}

function extractDateSection(content, dateHeading) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(line => line.trim() === dateHeading);
  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\d{2}-[A-Z][a-z]{2}-\d{4}$/.test(lines[index].trim())) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

function searchFileContent(path, content, query) {
  const term = query.trim().toLowerCase();
  if (!term || path.split("/").pop().toLowerCase().includes(term)) {
    return { matched: true, content, matchCount: term ? 1 : 0 };
  }

  const matchingLines = content.split(/\r?\n/).filter(line => line.toLowerCase().includes(term));
  return {
    matched: matchingLines.length > 0,
    content: matchingLines.join("\n"),
    matchCount: matchingLines.length
  };
}

function ClearableField({ value, onClear, children, multiline = false }) {
  return (
    <span className={`clearable-field${multiline ? " multiline" : ""}`}>
      {children}
      {value && <button type="button" className="clear-input-button" onClick={onClear} aria-label="Clear input" title="Clear input"><X size={15} /></button>}
    </span>
  );
}


function normalizeEntries(raw) {
  const values = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return [...new Set(values)];
}

function updateLog(existing, dateHeading, entries, logType) {
  // Preserve existing content and the required two blank lines between date sections.
  let content = (existing || "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!entries.length) return { content, added: [], duplicates: [] };

  if (logType === "others" || logType === "todos") {
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
  const [showUploadValidation, setShowUploadValidation] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [searchFolder, setSearchFolder] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [worklogDate, setWorklogDate] = useState("");
  const [worklogFolderPath, setWorklogFolderPath] = useState("");
  const [readerResults, setReaderResults] = useState([]);
  const [readerContent, setReaderContent] = useState("");
  const [readerFile, setReaderFile] = useState("");
  const [readerMessage, setReaderMessage] = useState(null);
  const [searchCopyMessage, setSearchCopyMessage] = useState("");
  const [folderTree, setFolderTree] = useState([]);
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);
  const [folderTreeLoading, setFolderTreeLoading] = useState(false);
  const [folderTreeError, setFolderTreeError] = useState("");

  const entries = useMemo(() => normalizeEntries(ticketInput), [ticketInput]);
  const dateParts = useMemo(() => getDateParts(date || todayInIndia()), [date]);
  const folderPathParts = filePath.trim().split(/[\\/]+/).filter(Boolean);
  const targetFileName = logType === "worklogs"
    ? ensureTxtExtension(customFileName.trim() || dateParts.fileName)
    : logType === "todos"
      ? getTodoTaskFileName(date || todayInIndia(), customFileName)
      : (customFileName.trim()
        ? `${customFileName.trim().replace(/\.txt$/i, "")}${yearFolder.trim() ? `-${yearFolder.trim()}` : ""}.txt`
        : "");

  const targetPath = logType === "todos"
    ? ["data", "todos", targetFileName].join("/")
    : logType === "worklogs"
      ? ["data", "worklogs", yearFolder.trim(), ...folderPathParts, targetFileName].filter(Boolean).join("/")
      : ["data", ...folderPathParts, targetFileName].filter(Boolean).join("/");
  const searchPathFolder = searchFolder.trim().replace(/^data[\\/]/i, "").replace(/[\\/]+$/, "").toLowerCase();
  const searchPathCategory = ["worklogs", "business", "todos"].includes(searchPathFolder) ? searchPathFolder : "";
  const searchPath = searchPathCategory === "worklogs"
    ? worklogDate
      ? (() => {
        const parts = getDateParts(worklogDate);
        const subfolders = worklogFolderPath.trim().split(/[\\/]+/).filter(Boolean);
        return ["data", "worklogs", String(parts.year), ...subfolders].join("/") + ` — ${parts.dateHeading}`;
      })()
      : `data/worklogs${worklogFolderPath.trim() ? ` (all years) / ${worklogFolderPath.trim()}` : " (all years)"}`
    : searchPathCategory === "business"
      ? "data/business"
      : searchPathCategory === "todos"
        ? `data/todos/*${getDateParts(todayInIndia()).dateHeading}-todo-task.txt`
        : "";

  function resetLogForms() {
    const today = todayInIndia();
    setCopyMessage("");
    setLogType("");
    setFilePath("");
    setYearFolder("");
    setCustomFileName("");
    setTicketInput("");
    setDate(today);
    setMessage(null);
    setPreviewOpen(true);
    setPreviewContent("");
    setPreviewMeta(null);
    setShowValidation(false);
    setShowUploadValidation(false);
    setSearchFolder("");
    setSearchText("");
    setSearchCategory("");
    setWorklogDate("");
    setWorklogFolderPath("");
    setReaderContent("");
    setReaderFile("");
    setReaderResults([]);
    setReaderMessage(null);
    setSearchCopyMessage("");
    setFolderTree([]);
    setFolderTreeOpen(false);
    setFolderTreeError("");
  }

  function resetAll() {
    resetLogForms();
    setOwnerRepo("");
    setBranch("main");
    setToken("");
    setShowToken(false);
    setActiveTab("add");
    setWorkspaceOpen(false);
  }

  function openWorkspace() {
    setShowUploadValidation(true);
    if (!owner || !repo || !token.trim()) return;
    setWorkspaceOpen(true);
  }

  async function copyPreview() {
    if (!previewContent) return;
    try {
      await navigator.clipboard.writeText(previewContent);
      setCopyMessage("Preview copied to clipboard.");
    } catch (error) {
      setCopyMessage(`Could not copy preview: ${error.message || "Clipboard access is unavailable."}`);
    }
  }

  async function copySearchResult() {
    if (!readerContent) return;
    try {
      await navigator.clipboard.writeText(readerContent);
      setSearchCopyMessage("Preview copied to clipboard.");
    } catch (error) {
      setSearchCopyMessage(`Could not copy search result: ${error.message || "Clipboard access is unavailable."}`);
    }
  }

  function clearSearchResult() {
    setReaderContent("");
    setReaderFile("");
    setReaderResults([]);
    setReaderMessage(null);
    setSearchCopyMessage("");
  }

  function selectReaderResult(path) {
    const result = readerResults.find(item => item.path === path);
    if (!result) return;
    setReaderFile(result.path);
    setReaderContent(result.content);
    setSearchCopyMessage("");
  }

  const validationErrors = {
    logType: !logType
      ? "Select a log type."
      : "",
    yearFolder: logType === "worklogs" && !yearFolder.trim()
      ? "Year is required for Worklogs."
      : logType !== "todos" && yearFolder.trim() && !/^\d{4}$/.test(yearFolder.trim())
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
  const repositoryPath = ownerRepo.trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const repoMatch = repositoryPath.match(/^([^/\s]+)\/([^/\s#?]+)$/);
  const owner = repoMatch?.[1];
  const repo = repoMatch?.[2]?.replace(/\.git$/, "");
  const selectedBranch = branch.trim() || "main";

  function contentsEndpoint(path) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(selectedBranch)}`;
  }

  function hasReaderConnection() {
    if (!owner || !repo || !token.trim()) {
      setReaderMessage({ type: "error", text: "Enter a valid GitHub repository and access token above first." });
      return false;
    }
    return true;
  }

  async function fetchFileContent(path) {
    const data = await githubRequest(contentsEndpoint(path));
    if (Array.isArray(data)) throw new Error("The selected path is a directory, not a file.");
    return decodeContent(data.content || "");
  }

  async function listTextFiles(path) {
    const items = await githubRequest(contentsEndpoint(path));
    if (!Array.isArray(items)) throw new Error(`The selected path is not a folder: ${path}`);

    const files = [];
    for (const item of items) {
      if (item.type === "file" && /\.txt$/i.test(item.name)) {
        files.push(item.path);
      } else if (item.type === "dir") {
        files.push(...await listTextFiles(item.path));
      }
    }
    return files.sort((a, b) => a.localeCompare(b));
  }

  async function loadFolderTree(path) {
    const items = await githubRequest(contentsEndpoint(path));
    if (!Array.isArray(items)) throw new Error(`The selected path is not a folder: ${path}`);

    const folders = items.filter(item => item.type === "dir");
    return Promise.all(folders.map(async folder => ({
      name: folder.name,
      path: folder.path,
      children: await loadFolderTree(folder.path)
    })));
  }

  async function toggleFolderTree() {
    if (folderTreeOpen) {
      setFolderTreeOpen(false);
      return;
    }
    if (folderTree.length) {
      setFolderTreeOpen(true);
      return;
    }
    if (!hasReaderConnection()) return;

    setFolderTreeLoading(true);
    setFolderTreeError("");
    try {
      setFolderTree(await loadFolderTree("data"));
      setFolderTreeOpen(true);
    } catch (error) {
      setFolderTreeError(`Could not load folder tree: ${error.message}`);
    } finally {
      setFolderTreeLoading(false);
    }
  }

  function renderFolderTree(nodes) {
    if (!nodes.length) return <span className="folder-tree-empty">No folders found.</span>;
    return <ul>{nodes.map(node => (
      <li key={node.path}>
        <span><FolderTree size={14} /> {node.name}</span>
        {node.children.length > 0 && renderFolderTree(node.children)}
      </li>
    ))}</ul>;
  }

  async function loadWorklogForDate(query = "") {
    setReaderMessage(null);
    setReaderContent("");
    setReaderFile("");
    setReaderResults([]);
    if (!hasReaderConnection()) return;

    const subfolders = worklogFolderPath.trim().split(/[\\/]+/).filter(Boolean);
    const parts = worklogDate ? getDateParts(worklogDate) : null;
    const searchRoot = parts
      ? ["data", "worklogs", String(parts.year), ...subfolders].join("/")
      : ["data", "worklogs", ...subfolders].join("/");
    setBusy(true);
    try {
      let paths;
      if (parts || !subfolders.length) {
        paths = await listTextFiles(searchRoot);
      } else {
        const yearFolders = await githubRequest(contentsEndpoint("data/worklogs"));
        if (!Array.isArray(yearFolders)) throw new Error("The worklogs path is not a folder.");
        const yearDirectories = yearFolders.filter(item => item.type === "dir");
        const fileLists = await Promise.all(yearDirectories.map(async yearFolder => {
          try {
            return await listTextFiles([yearFolder.path, ...subfolders].join("/"));
          } catch (error) {
            if (error.status === 404) return [];
            throw error;
          }
        }));
        paths = fileLists.flat();
      }
      const results = (await Promise.all(paths.map(async path => {
        const content = await fetchFileContent(path);
        const scopedContent = parts ? extractDateSection(content, parts.dateHeading) : content;
        if (parts && !scopedContent) return null;
        const result = searchFileContent(path, scopedContent, query);
        return result.matched ? { path, content: result.content } : null;
      }))).filter(Boolean);
      setReaderResults(results);
      setReaderFile(results[0]?.path || "");
      setReaderContent(results[0]?.content || "");
      setReaderMessage({
        type: results.length ? "success" : "info",
        text: results.length
          ? `Found ${results.length} matching worklog file${results.length === 1 ? "" : "s"}${parts ? ` for ${parts.dateHeading}` : ""}.`
          : `No worklog files matched${parts ? ` ${parts.dateHeading}` : " the selected filters"}.`
      });
    } catch (error) {
      if (error.status === 404) {
        setReaderMessage({ type: "info", text: `No worklog folder found or accessible: ${searchRoot}` });
      } else {
        setReaderMessage({ type: "error", text: `Could not search worklogs: ${error.message}` });
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadBusinessFiles(query = "") {
    setReaderMessage(null);
    setReaderResults([]);
    if (!hasReaderConnection()) return;

    setBusy(true);
    try {
      const paths = await listTextFiles("data/business");
      const results = (await Promise.all(paths.map(async path => {
        const content = await fetchFileContent(path);
        const result = searchFileContent(path, content, query);
        return result.matched ? { path, content: result.content } : null;
      }))).filter(Boolean);
      setReaderResults(results);
      setReaderFile(results[0]?.path || "");
      setReaderContent(results[0]?.content || "");
      setReaderMessage({
        type: results.length ? "success" : "info",
        text: results.length
          ? `Found ${results.length} matching business file${results.length === 1 ? "" : "s"}.`
          : query.trim() ? "No business files match that search." : "No text files found in data/business."
      });
    } catch (error) {
      setReaderMessage({ type: "error", text: `Could not search business files: ${error.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function loadTodayTodos(query = "") {
    setReaderMessage(null);
    setReaderContent("");
    setReaderFile("");
    setReaderResults([]);
    if (!hasReaderConnection()) return;

    const today = todayInIndia();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const oldestKeptDate = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() - 7));
    setBusy(true);

    try {
      const directory = await githubRequest(contentsEndpoint("data/todos"));
      if (!Array.isArray(directory)) throw new Error("The todos path is a file, not a folder.");

      const expiredFiles = directory.filter(item => {
        if (item.type !== "file") return false;
        const fileDate = getTodoFileDate(item.name);
        return fileDate && fileDate < oldestKeptDate;
      });

      let deletedCount = 0;
      const deletionErrors = [];
      for (const file of expiredFiles) {
        try {
          await githubRequest(contentsEndpoint(file.path), {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `Delete expired todo file ${file.name}`,
              sha: file.sha,
              branch: selectedBranch
            })
          });
          deletedCount += 1;
        } catch (error) {
          deletionErrors.push(`${file.name}: ${error.message}`);
        }
      }

      const todayFiles = directory.filter(item => {
        if (item.type !== "file") return false;
        const fileDate = getTodoFileDate(item.name);
        return fileDate && fileDate.getTime() === todayDate.getTime();
      });
      const results = (await Promise.all(todayFiles.map(async file => {
        const content = await fetchFileContent(file.path);
        const result = searchFileContent(file.path, content, query);
        return result.matched ? { path: file.path, content: result.content } : null;
      }))).filter(Boolean);
      setReaderResults(results);
      setReaderFile(results[0]?.path || "");
      setReaderContent(results[0]?.content || "");

      if (deletionErrors.length) {
        setReaderMessage({
          type: "error",
          text: `Loaded ${results.length} matching todo file${results.length === 1 ? "" : "s"} for today, but cleanup was incomplete (${deletedCount} deleted; ${deletionErrors.join("; ")}).`
        });
      } else {
        setReaderMessage({
          type: results.length ? "success" : "info",
          text: `${results.length
            ? `Found ${results.length} matching todo file${results.length === 1 ? "" : "s"} for today.`
            : todayFiles.length ? "No todo files for today match that search." : "No todo files exist for today yet."
          } Removed ${deletedCount} dated file${deletedCount === 1 ? "" : "s"} more than 7 days old.`
        });
      }
    } catch (error) {
      setReaderMessage({ type: "error", text: `Could not load today's todos: ${error.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function checkFolder() {
    const folder = searchFolder.trim().replace(/^data[\\/]/i, "").replace(/[\\/]+$/, "").toLowerCase();
    const category = ["worklogs", "business", "todos"].includes(folder) ? folder : "";
    setReaderMessage(null);
    setReaderContent("");
    setReaderFile("");
    setSearchCopyMessage("");

    if (!category) {
      setSearchCategory("");
      setReaderMessage({ type: "error", text: "Enter one folder name: worklogs, business, or todos." });
      return;
    }

    if (!hasReaderConnection()) return;

    setSearchCategory(category);
    setReaderResults([]);

    if (category === "worklogs") {
      await loadWorklogForDate(searchText);
    } else if (category === "todos") {
      await loadTodayTodos(searchText);
    } else {
      await loadBusinessFiles(searchText);
    }
  }

  
  async function githubRequest(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          `Could not connect to GitHub API (${error.message}). Check your internet connection, VPN/proxy, firewall, or browser extensions; GitHub returned no HTTP response.`
        );
      }
      throw error;
    }
  
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
    setCopyMessage("");
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
    setCopyMessage("");
    setShowValidation(true);
    setShowUploadValidation(true);

    const uploadErrors = Object.values(validationErrors).filter(Boolean);
    if (!owner || !repo) uploadErrors.push("Enter a GitHub repository as owner/repository.");
    if (!token.trim()) uploadErrors.push("Enter a GitHub token with repository Contents read/write permission.");
    if (!entries.length) uploadErrors.push("Enter at least one ticket or summary detail.");
    if (uploadErrors.length) {
      setMessage({
        type: "error",
        text: uploadErrors.join(" ")
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
  
      // The Contents API creates missing parent directories when it creates the file.
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
        text: `${sha ? "Updated" : `Created ${targetPath} and any missing folders`} successfully.`,
        url: fileUrl
      });
  
    } catch (error) {
      setMessage({
        type: "error",
        text: `Upload failed: ${error.message || "Could not save the log to GitHub."}`
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

      <section className="connection-panel form-panel">
        <div className="section-heading">
          <div className="step-number">01</div>
          <div><h2>Connect your repository</h2><p>These settings are shared by all tabs.</p></div>
        </div>
        <label htmlFor="repo">GitHub repository</label>
        <div className="repo-input">
          <span className="repo-input-prefix"><Github size={17} /><span>https://github.com</span></span>
          <ClearableField value={ownerRepo} onClear={() => setOwnerRepo("")}><input id="repo" value={ownerRepo} onChange={e => setOwnerRepo(e.target.value)} placeholder="/owner/repository" autoComplete="off" aria-invalid={showUploadValidation && (!owner || !repo)} style={showUploadValidation && (!owner || !repo) ? { borderColor: "#dc2626" } : undefined} /></ClearableField>
        </div>
        {showUploadValidation && (!owner || !repo) && <span className="invalid-count" role="alert">Enter a GitHub repository as owner/repository.</span>}
        <div className="connection-fields">
          <div>
            <label htmlFor="branch">Branch</label>
            <input id="branch" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
          </div>
          <div>
            <label htmlFor="token">GitHub personal access token</label>
            <div className="token-wrap"><ClearableField value={token} onClear={() => setToken("")}><input id="token" type={showToken ? "text" : "password"} value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your GitHub token" autoComplete="off" aria-invalid={showUploadValidation && !token.trim()} style={showUploadValidation && !token.trim() ? { borderColor: "#dc2626" } : undefined} /></ClearableField><button className="icon-button" type="button" onClick={() => setShowToken(v => !v)} aria-label={showToken ? "Hide token" : "Show token"}>{showToken ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            {showUploadValidation && !token.trim() && <span className="invalid-count" role="alert">Enter a GitHub token with repository Contents read/write permission.</span>}
          </div>
        </div>
        <p className="hint">Use a fine-grained token limited to this repository with <b>Contents: Read and write</b>. The token stays in this tab and is not saved by this app.</p>
        {!workspaceOpen && <button type="button" className="primary-button" onClick={openWorkspace} aria-expanded={workspaceOpen}>Open workspace</button>}
      </section>

      {workspaceOpen && <>
      <nav className="tab-bar" role="tablist" aria-label="Log tools">
        <button type="button" role="tab" aria-selected={activeTab === "add"} className={activeTab === "add" ? "active" : ""} onClick={() => setActiveTab("add")} disabled={busy}>Add log</button>
        <button type="button" role="tab" aria-selected={activeTab === "search"} className={activeTab === "search" ? "active" : ""} onClick={() => setActiveTab("search")} disabled={busy}>Search logs</button>
      </nav>
      <div className="reset-actions">
        <button type="button" className="secondary-button" onClick={resetLogForms} disabled={busy}><RotateCcw size={16} /> Reset forms</button>
        <button type="button" className="secondary-button" onClick={resetAll} disabled={busy}><Eraser size={16} /> Reset all</button>
      </div>

      {activeTab === "add" ? <section className="workspace">
        <div className="form-panel">
          <div className="section-heading">
            <div className="step-number">02</div>
            <div><h2>Choose log type</h2><p>Select where the new entry should be saved.</p></div>
          </div>
          <div className="two-col">
            <div>
              <label htmlFor="log-type">Log type</label>
              <select id="log-type" value={logType} onChange={e => { setLogType(e.target.value); setShowValidation(false); }}>
                <option value="" disabled>Select log type</option>
                <option value="worklogs">Worklogs</option>
                <option value="todos">Todos</option>
                <option value="others">Others</option>
              </select>
              {showValidation && validationErrors.logType && <span className="invalid-count" role="alert">{validationErrors.logType}</span>}
            </div>
          </div>
          {logType === "todos"
            ? <p className="hint">Todos are saved directly in <code>data/todos/</code> as <code>[optional-name__]DD-MMM-YYYY-todo-task.txt</code>.</p>
            : <div className="path-section">
              <label htmlFor="path">Folder path <span className="optional">{logType === "worklogs" ? "optional" : "required"}</span></label>
              <ClearableField value={filePath} onClear={() => setFilePath("")}><input id="path" value={filePath} onChange={e => setFilePath(e.target.value)} placeholder={logType === "worklogs" ? "Optional, e.g. project" : "Required, e.g. project"} aria-invalid={showValidation && Boolean(validationErrors.filePath)} style={showValidation && validationErrors.filePath ? { borderColor: "#dc2626" } : undefined} /></ClearableField>
              {showValidation && validationErrors.filePath && <span className="invalid-count" role="alert">{validationErrors.filePath}</span>}
            </div>}

          <div className="section-divider" />

          <div className="section-heading">
            <div className="step-number">03</div>
            <div><h2>Add log details</h2><p>Enter the details to include in this log.</p></div>
          </div>
          <label htmlFor="tickets">Jira ticket / summary details</label>
          <ClearableField value={ticketInput} onClear={() => setTicketInput("")} multiline><textarea id="tickets" rows={5} value={ticketInput} onChange={e => setTicketInput(e.target.value)} placeholder={"Enter a Jira URL or a summary, for example:\nhttps://your-domain.atlassian.net/browse/PROJ-123\nInvestigated the issue and updated the workflow"} aria-invalid={showUploadValidation && !entries.length} style={showUploadValidation && !entries.length ? { borderColor: "#dc2626" } : undefined} /></ClearableField>
          <div className="input-footer"><span>{entries.length} unique {entries.length === 1 ? "entry" : "entries"}</span></div>
          {showUploadValidation && !entries.length && <span className="invalid-count" role="alert">Enter at least one ticket or summary detail.</span>}

          <div className="section-divider" />
          <div className="section-heading compact">
            <div className="step-number">04</div>
            <div><h2>Choose log date</h2><p>Uses India time by default.</p></div>
          </div>
          <div className="date-control"><CalendarDays size={18} /><ClearableField value={date} onClear={() => setDate("")}><input type="date" value={date} onChange={e => setDate(e.target.value)} /></ClearableField></div>
          <div className="two-col file-options">
            {logType !== "todos" && <div>
              <label htmlFor="year-folder">Year <span className="optional">{logType === "worklogs" ? "required" : "optional"}</span></label>
              <ClearableField value={yearFolder} onClear={() => setYearFolder("")}><input id="year-folder" type="text" value={yearFolder} onChange={e => setYearFolder(e.target.value)} placeholder="e.g. 2026" aria-invalid={showValidation && Boolean(validationErrors.yearFolder)} style={showValidation && validationErrors.yearFolder ? { borderColor: "#dc2626" } : undefined} /></ClearableField>
              {showValidation && validationErrors.yearFolder && <span className="invalid-count" role="alert">{validationErrors.yearFolder}</span>}
            </div>}
            <div>
              <label htmlFor="file-name">{logType === "todos" ? "Name / ID" : "File name"} <span className="optional">{logType === "worklogs" || logType === "todos" ? "optional" : "required"}</span></label>
              <ClearableField value={customFileName} onClear={() => setCustomFileName("")}><input id="file-name" value={customFileName} onChange={e => setCustomFileName(e.target.value)} placeholder={logType === "worklogs" ? dateParts.fileName : logType === "todos" ? "Optional name or ID prefix" : "Enter file name"} aria-invalid={showValidation && Boolean(validationErrors.customFileName)} style={showValidation && validationErrors.customFileName ? { borderColor: "#dc2626" } : undefined} /></ClearableField>
              {showValidation && validationErrors.customFileName && <span className="invalid-count" role="alert">{validationErrors.customFileName}</span>}
            </div>
          </div>
          <div className="file-target"><FileText size={18} /><div><span>Target file</span><strong>{targetPath}</strong></div><span className="file-tag">{targetFileName.includes(".") ? targetFileName.split(".").pop().toUpperCase() : "FILE"}</span></div>

          {message && <div className={`notice ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{message.text}{message.url && <a href={message.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink size={13} /></a>}</div></div>}

          <div className="actions">
            <button className="secondary-button" onClick={loadPreview} disabled={busy}><Eye size={17} /> Preview update</button>
            <button className="primary-button" onClick={saveToGithub} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Working…</> : <><Github size={17} /> Save to GitHub</>}</button>
          </div>
          <p className="security-note"><AlertCircle size={14} /> Review the preview before saving. Saving creates a commit on the selected branch.</p>
        </div>

        <aside className="preview-panel">
          <div className="preview-header"><div><span className="preview-kicker">LIVE PREVIEW</span><h2>Detailed log</h2></div><div><button type="button" className="icon-button" onClick={copyPreview} aria-label="Copy preview" title="Copy preview" disabled={!previewContent}><Copy size={17} /></button><button type="button" className="icon-button" onClick={() => setPreviewOpen(v => !v)} aria-label="Toggle preview">{previewOpen ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
          {copyMessage && <div className={`copy-feedback ${copyMessage.startsWith("Could not") ? "error" : ""}`} role="status">{copyMessage}</div>}
          <div className="preview-file"><FileText size={16} /><span>{targetFileName || "Select a log type"}</span><span className="branch-pill">{branch.trim() || "main"}</span></div>
          {previewOpen && <div className="code-preview">{previewContent ? previewContent.split("\n").map((line, index) => <div className={`code-line ${/^\d{2}-[A-Z][a-z]{2}-\d{4}$/.test(line) ? "date-line" : line === "++++++++" ? "separator-line" : line.startsWith("https://") ? "url-line" : ""}`} key={`${index}-${line}`}>{line || "\u00a0"}</div>) : <div className="empty-preview"><div className="empty-icon"><Link2 size={22} /></div><strong>Your log preview appears here</strong><span>Enter your repository and details, then choose Preview update.</span></div>}</div>}
          <div className="rules-card"><strong><CheckCircle2 size={16} /> Formatting rules</strong><ul><li>Date heading: <code>dd-MMM-yyyy</code></li><li>Section divider: <code>++++++++</code></li><li>Exactly two blank lines between date sections</li><li>Entries listed once per date</li><li>Creates the monthly file if missing</li></ul></div>
          {previewMeta && <div className="preview-stats"><div><span>New entries</span><strong>{previewMeta.added.length}</strong></div><div><span>Already logged</span><strong>{previewMeta.duplicates.length}</strong></div></div>}
          <div className="preview-footer"><span className="status-dot" /> Your changes are only committed when you click Save to GitHub.</div>
        </aside>
      </section> : (
      <section className="reader-panel form-panel">
        <div className="section-heading">
          <div className="step-number">02</div>
          <div>
            <h2>Search your data folders</h2>
            <p>Enter a folder name to load its matching view.</p>
          </div>
        </div>

        <div className="folder-search">
          <label htmlFor="search-folder">Folder name</label>
          <ClearableField value={searchFolder} onClear={() => {
            setSearchFolder("");
            setSearchCategory("");
            setReaderContent("");
            setReaderFile("");
            setReaderResults([]);
            setReaderMessage(null);
            setSearchCopyMessage("");
          }}><input id="search-folder" value={searchFolder} onChange={event => {
            setSearchFolder(event.target.value);
            setSearchCategory("");
            setReaderContent("");
            setReaderFile("");
            setReaderResults([]);
            setReaderMessage(null);
            setSearchCopyMessage("");
          }} onKeyDown={event => { if (event.key === "Enter" && !busy) checkFolder(); }} placeholder="worklogs, business, or todos" /></ClearableField>
          <p className="hint">You can enter <code>worklogs</code>, <code>business</code>, or <code>todos</code>.</p>
          <button type="button" className="secondary-button folder-tree-toggle" onClick={toggleFolderTree} disabled={folderTreeLoading}>
            {folderTreeLoading ? <><LoaderCircle className="spin" size={16} /> Loading folders…</> : <><FolderTree size={16} /> {folderTreeOpen ? "Hide available folders" : "Show available folders"}</>}
          </button>
          {folderTreeError && <p className="folder-tree-error" role="alert">{folderTreeError}</p>}
          {folderTreeOpen && <div className="folder-tree" aria-label="Available repository folders">
            <strong>data/</strong>
            {renderFolderTree(folderTree)}
          </div>}
          <label className="search-text-label" htmlFor="search-text">Search text or file name</label>
          <div className="query-search-controls">
            <ClearableField value={searchText} onClear={() => {
              setSearchText("");
              setReaderMessage(null);
            }}><input id="search-text" value={searchText} onChange={event => {
              setSearchText(event.target.value);
              setReaderMessage(null);
            }} onKeyDown={event => { if (event.key === "Enter" && !busy) checkFolder(); }} placeholder="Enter text to find in log contents or file names" /></ClearableField>
            <button type="button" className="primary-button" onClick={checkFolder} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Searching…</> : <><Search size={17} /> Search</>}</button>
          </div>
          <p className="hint">Search text is optional for all folders. Blank searches show all matching files; Todos shows files dated today. Worklogs can be filtered by date and subfolder; leaving the date blank searches across all years.</p>
          <div className="search-path">
            <strong>Search path</strong>
            <code>{searchPath || "Enter worklogs, business, or todos"}</code>
          </div>
        </div>

        {searchPathCategory === "worklogs" && (
          <div className="reader-toolbar">
            <div>
              <label htmlFor="worklog-date">Worklog date <span className="optional">optional</span></label>
              <div className="date-control"><CalendarDays size={18} /><ClearableField value={worklogDate} onClear={() => setWorklogDate("")}><input id="worklog-date" type="date" value={worklogDate} onChange={event => setWorklogDate(event.target.value)} /></ClearableField></div>
              <div className="worklog-subfolder-field">
                <label htmlFor="worklog-folder">Worklogs subfolder <span className="optional">optional</span></label>
                <ClearableField value={worklogFolderPath} onClear={() => setWorklogFolderPath("")}><input id="worklog-folder" value={worklogFolderPath} onChange={event => setWorklogFolderPath(event.target.value)} placeholder="e.g. team" /></ClearableField>
              </div>
            </div>
          </div>
        )}

        {searchCategory === "todos" && (
          <div className="todo-retention">
              <span>Files: <code>data/todos/*{getDateParts(todayInIndia()).dateHeading}-todo-task.txt</code></span>
              <span>Deletes dated todo files more than 7 days old; other files are left untouched.</span>
          </div>
        )}

        {readerMessage && <div className={`notice ${readerMessage.type}`} role={readerMessage.type === "error" ? "alert" : "status"}>{readerMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{readerMessage.text}</div></div>}
        <div className="reader-result">
          {readerResults.length > 1 && <div className="reader-result-select">
            <label htmlFor="reader-result-file">Matching files</label>
            <select id="reader-result-file" value={readerFile} onChange={event => selectReaderResult(event.target.value)}>
              {readerResults.map(result => <option value={result.path} key={result.path}>{result.path}</option>)}
            </select>
          </div>}
          <div className="reader-result-actions"><button type="button" className="secondary-button" onClick={copySearchResult} disabled={!readerContent}><Copy size={16} /> Copy preview</button><button type="button" className="secondary-button" onClick={clearSearchResult} disabled={!readerFile && !readerContent && !readerResults.length && !readerMessage}><Eraser size={16} /> Clear results</button></div>
          {searchCopyMessage && <div className={`copy-feedback ${searchCopyMessage.startsWith("Could not") ? "error" : ""}`} role="status">{searchCopyMessage}</div>}
          {readerResults.length
            ? (() => {
              const result = readerResults.find(item => item.path === readerFile) || readerResults[0];
              return <div className="reader-result-card" key={result.path}>
                <div className="preview-file"><FileText size={16} /><span>{result.path}</span><span className="branch-pill">{selectedBranch}</span></div>
                <pre>{result.content || "No matching content found in this file."}</pre>
              </div>;
            })()
            : <div className="reader-result-card">
              <div className="preview-file"><FileText size={16} /><span>{readerFile || "Fetched content will appear here"}</span><span className="branch-pill">{selectedBranch}</span></div>
              <pre>{readerFile ? (readerContent || "No content found for this file.") : "Connect your repository, then fetch content to view it here."}</pre>
            </div>}
        </div>
      </section>
      )}
      <footer className="footer"><span>Ticket Log Manager</span><span>React · GitHub Contents API</span></footer>
      </>}
    </main>
  );
}