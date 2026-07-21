import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSliceArguments, detectBambuStudio, probeBambuStudio, runBambuSlice, validateInputPath } from "../local-hub/slicing/bambu-studio.mjs";

test("validates STL/3MF and rejects shell-shaped unsupported inputs", () => {
  assert.equal(validateInputPath(path.resolve("part.stl")), path.resolve("part.stl"));
  assert.throws(() => validateInputPath(path.resolve("part.gcode;echo-pwned")), /STL or 3MF/);
  assert.throws(() => validateInputPath("relative.stl"), /absolute/);
});

test("constructs an argument array without invoking a shell", () => {
  const root = path.resolve("fixture workspace");
  const args = buildSliceArguments({ inputPath: path.join(root, "part; safe.stl"), outputPath: path.join(root, "out.3mf"), printerConfigPath: path.join(root, "printer.json"), processConfigPath: path.join(root, "process.json"), filamentConfigPaths: [path.join(root, "pla.json")], plateIndex: 2 });
  assert.deepEqual(args.slice(0, 2), ["--slice", "0"]);
  assert.equal(args.at(-1), path.join(root, "part; safe.stl"));
  assert.equal(args.includes("--plate"), true);
});

test("detects an explicitly configured executable", async () => {
  assert.equal(await detectBambuStudio({ configuredPath: process.execPath, env: {}, platform: "test" }), process.execPath);
});

test("probes and runs against the fake CLI fixture without Bambu Studio installed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "layertrace-slicer-"));
  const fixture = fileURLToPath(new URL("./fixtures/fake-bambu-cli.mjs", import.meta.url));
  const version = await probeBambuStudio(process.execPath, { argsPrefix: [fixture] });
  assert.match(version.version, /9\.9\.9-fixture/);
  const input = path.join(root, "input.stl"), output = path.join(root, "output.3mf");
  await writeFile(input, "solid fixture\nendsolid fixture");
  for (const name of ["printer.json", "process.json", "pla.json"]) await writeFile(path.join(root, name), "{}");
  const result = await runBambuSlice(process.execPath, { inputPath: input, outputPath: output, printerConfigPath: path.join(root, "printer.json"), processConfigPath: path.join(root, "process.json"), filamentConfigPaths: [path.join(root, "pla.json")] }, { timeoutMs: 5_000, argsPrefix: [fixture] });
  assert.equal(result.status, "succeeded");
});
