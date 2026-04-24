import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const scanRoots = [
  "src/app",
  "src/components",
  "src/pages",
  "src/lib",
  "public",
  "next.config.js",
];

const textFileExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
]);

const ignoredDirs = new Set(["node_modules", ".git", ".next", "out"]);

const allowedEnvNames = new Set([
  "NODE_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

const forbiddenPatterns = [
  { label: "OpenAI secret key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { label: "Supabase secret key", regex: /\bsb_secret_[A-Za-z0-9_-]+\b/g },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", regex: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { label: "Generic bearer token literal", regex: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { label: "API key query parameter", regex: /[?&](?:api[_-]?key|access[_-]?token|token)=([A-Za-z0-9._-]{12,})/gi },
];

const findings = [];

function isTextFile(filePath) {
  return textFileExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(targetPath) {
  const absolutePath = path.join(repoRoot, targetPath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stats = fs.statSync(absolutePath);
  if (stats.isFile()) {
    return [absolutePath];
  }

  const results = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        results.push(...walk(path.join(targetPath, entry.name)));
      }
      continue;
    }

    const nextPath = path.join(absolutePath, entry.name);
    if (isTextFile(nextPath)) {
      results.push(nextPath);
    }
  }

  return results;
}

function pushFinding(filePath, lineNumber, label, sample) {
  findings.push({
    filePath: path.relative(repoRoot, filePath),
    lineNumber,
    label,
    sample,
  });
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(line)) {
        pushFinding(filePath, lineNumber, pattern.label, line.trim());
      }
      pattern.regex.lastIndex = 0;
    }

    const envMatches = line.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const match of envMatches) {
      const envName = match[1];
      if (!allowedEnvNames.has(envName)) {
        pushFinding(
          filePath,
          lineNumber,
          "Server-only env var referenced from shipped code",
          line.trim()
        );
      }
    }
  });
}

const files = scanRoots.flatMap((targetPath) => walk(targetPath));
files.forEach((filePath) => scanFile(filePath));

if (findings.length) {
  console.error("Exposed secret check failed:\n");
  findings.forEach((finding) => {
    console.error(
      `- ${finding.filePath}:${finding.lineNumber} [${finding.label}] ${finding.sample}`
    );
  });
  process.exit(1);
}

console.log("No secret-looking keys or server-only env vars found in frontend-shipped code.");
