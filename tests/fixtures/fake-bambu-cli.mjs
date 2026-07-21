import { writeFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("BambuStudio 9.9.9-fixture"); process.exit(0); }
const outputIndex = process.argv.indexOf("--export-3mf") + 1;
if (!outputIndex || !process.argv[outputIndex]) process.exit(3);
writeFileSync(process.argv[outputIndex], "fixture-3mf");
console.log(JSON.stringify({ estimatedSeconds: 420, totalFilamentGrams: 12.5 }));
