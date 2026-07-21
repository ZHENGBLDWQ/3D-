import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const supportedInputExtensions = new Set([".stl", ".3mf"]);
const terminalLimit = 64 * 1024;

export function validateInputPath(inputPath) {
  if (typeof inputPath !== "string" || !path.isAbsolute(inputPath)) throw new Error("Input path must be absolute");
  const extension = path.extname(inputPath).toLowerCase();
  if (!supportedInputExtensions.has(extension)) throw new Error("Bambu Studio input must be STL or 3MF");
  return inputPath;
}

export function buildSliceArguments({ inputPath, outputPath, printerConfigPath, processConfigPath, filamentConfigPaths, plateIndex }) {
  validateInputPath(inputPath);
  if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== ".3mf") throw new Error("Output must be an absolute 3MF path");
  const configs = [printerConfigPath, processConfigPath, ...(filamentConfigPaths ?? [])];
  if (configs.length < 3 || configs.some(item => typeof item !== "string" || !path.isAbsolute(item) || path.extname(item).toLowerCase() !== ".json")) throw new Error("Printer, process and filament JSON snapshots are required");
  const args = ["--slice", "0", "--load-settings", configs.join(";"), "--export-3mf", outputPath];
  if (plateIndex != null) {
    if (!Number.isInteger(plateIndex) || plateIndex < 1 || plateIndex > 256) throw new Error("Plate index is invalid");
    args.push("--plate", String(plateIndex));
  }
  args.push(inputPath);
  return args;
}

async function firstExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { await access(candidate); return candidate; } catch { /* try next candidate */ }
  }
  return null;
}

export async function detectBambuStudio({ configuredPath, platform = process.platform, env = process.env } = {}) {
  const candidates = [configuredPath, env.BAMBU_STUDIO_PATH];
  if (platform === "win32") candidates.push(
    "C:\\Program Files\\Bambu Studio\\bambu-studio.exe",
    "C:\\Program Files\\BambuStudio\\bambu-studio.exe",
  );
  if (platform === "darwin") candidates.push("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio");
  candidates.push("/usr/bin/bambu-studio", "/usr/local/bin/bambu-studio");
  return firstExecutable(candidates);
}

function runProcess(executable, args, { timeoutMs = 10_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], signal });
    let stdout = "", stderr = "", timedOut = false;
    const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-terminalLimit);
    child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", (code, closeSignal) => { clearTimeout(timer); resolve({ code, signal: closeSignal, stdout, stderr, timedOut }); });
  });
}

export async function probeBambuStudio(executable, options = {}) {
  const result = await runProcess(executable, [...(options.argsPrefix ?? []), "--version"], options);
  if (result.timedOut) throw new Error("Bambu Studio version probe timed out");
  if (result.code !== 0) throw new Error(`Bambu Studio version probe failed (${result.code})`);
  const version = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).find(Boolean) ?? "unknown";
  return { executable, version: version.slice(0, 160) };
}

export async function runBambuSlice(executable, request, options = {}) {
  const args = buildSliceArguments(request);
  const result = await runProcess(executable, [...(options.argsPrefix ?? []), ...args], options);
  if (result.timedOut) return { ...result, status: "timed_out", errorCode: "SLICE_TIMEOUT" };
  if (result.signal && options.signal?.aborted) return { ...result, status: "cancelled", errorCode: "SLICE_CANCELLED" };
  if (result.code !== 0) return { ...result, status: "failed", errorCode: "SLICER_EXIT_NONZERO" };
  return { ...result, status: "succeeded" };
}
