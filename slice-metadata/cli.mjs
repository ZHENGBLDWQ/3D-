#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename,resolve } from "node:path";
import { parseSliceFile,toUsageImport } from "./index.mjs";

const file=process.argv[2];if(!file){console.error("Usage: node slice-metadata/cli.mjs <sliced.3mf|file.gcode>");process.exitCode=2}else{try{const path=resolve(file),result=parseSliceFile(await readFile(path),{fileName:basename(path)});process.stdout.write(`${JSON.stringify(toUsageImport(result,{fileName:basename(path)}),null,2)}\n`)}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1}}
