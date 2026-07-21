export const catalogImportHeaders=["catalogCode","brand","series","material","colorName","colorNameEn","colorCode","colorHex","densityGcm3","defaultNetGrams","amsCompatibility","sourceUrl","sourceCheckedAt"] as const;
export type CatalogImportRow=Record<(typeof catalogImportHeaders)[number],string>;

export function parseCatalogCsv(csv:string){
 const lines:string[][]=[];let row:string[]=[],cell="",quoted=false;
 for(let index=0;index<csv.length;index++){const char=csv[index];if(char==='"'){if(quoted&&csv[index+1]==='"'){cell+='"';index++}else quoted=!quoted}else if(char===","&&!quoted){row.push(cell.trim());cell=""}else if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&csv[index+1]==="\n")index++;row.push(cell.trim());cell="";if(row.some(Boolean))lines.push(row);row=[]}else cell+=char}
 row.push(cell.trim());if(row.some(Boolean))lines.push(row);if(!lines.length)return [];
 const headers=lines[0].map(value=>value.replace(/^\uFEFF/,""));
 const missing=catalogImportHeaders.filter(header=>!headers.includes(header));if(missing.length)throw new Error(`模板缺少字段：${missing.join("、")}`);
 return lines.slice(1).map(values=>Object.fromEntries(catalogImportHeaders.map(header=>[header,values[headers.indexOf(header)]??""])) as CatalogImportRow);
}

export function normalizeCatalogImportRow(row:CatalogImportRow){return {...row,catalogCode:row.catalogCode.trim().toUpperCase(),brand:row.brand.trim(),series:row.series.trim(),material:row.material.trim().toUpperCase(),colorName:row.colorName.trim(),colorNameEn:row.colorNameEn.trim(),colorCode:row.colorCode.trim().toUpperCase(),colorHex:row.colorHex.replace(/^#/,"").trim().toUpperCase(),amsCompatibility:row.amsCompatibility.trim().toLowerCase(),sourceUrl:row.sourceUrl.trim(),sourceCheckedAt:row.sourceCheckedAt.trim()}}

export function validateCatalogImportRow(row:CatalogImportRow){const errors:string[]=[];if(!row.catalogCode)errors.push("目录编码不能为空");if(!row.brand)errors.push("品牌不能为空");if(!row.material)errors.push("材质不能为空");if(!/^[0-9A-F]{6}$/.test(row.colorHex))errors.push("颜色必须是 6 位 HEX");if(!(Number(row.densityGcm3)>0))errors.push("密度必须大于 0");if(!(Number(row.defaultNetGrams)>0))errors.push("默认净重必须大于 0");if(!["compatible","limited","incompatible","unknown"].includes(row.amsCompatibility))errors.push("AMS 兼容性无效");if(row.sourceCheckedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(row.sourceCheckedAt))errors.push("核验日期格式应为 YYYY-MM-DD");return errors}

export function catalogImportTemplate(){return `${catalogImportHeaders.join(",")}\nCUSTOM-PLA-WHITE,自有品牌,PLA系列,PLA,白色,White,W01,FFFFFF,1.24,1000,compatible,https://example.com,2026-07-22\n`}
