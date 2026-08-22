import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function packageVersion(root) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    return String(pkg.version || "unknown");
  } catch {
    return "unknown";
  }
}

function gitRevision(root) {
  const explicit = String(process.env.IKEALIVE_REVISION || "").trim();
  if (explicit) return explicit;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function runtimeBuild(root = process.cwd()) {
  const version = packageVersion(root);
  const revision = gitRevision(root);
  return {
    version,
    revision,
    id: `${version}@${revision === "unknown" ? revision : revision.slice(0, 12)}`,
  };
}

export function buildsMatch(expected, actual) {
  if (!expected || !actual) return false;
  if (expected.version !== actual.version) return false;
  if (expected.revision === "unknown" || actual.revision === "unknown") {
    return expected.id === actual.id;
  }
  return expected.revision === actual.revision;
}
