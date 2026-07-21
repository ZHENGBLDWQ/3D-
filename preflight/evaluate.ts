import type {PreflightCheck,PreflightInput,PreflightLevel,PreflightResult} from "../shared/contracts/preflight";

const rank:Record<PreflightLevel,number>={pass:0,unknown:1,warning:2,block:3};
const check=(code:string,category:PreflightCheck["category"],level:PreflightLevel,message:string,resolutionActions:string[]=[],details?:Record<string,unknown>):PreflightCheck=>({code,category,level,message,resolutionActions,details});
const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();

export function requiredMaterialGrams(input:{slicedGrams:number;purgeGrams?:number;safetyPercent?:number;minimumReserveGrams?:number}){
  const sliced=Math.max(0,input.slicedGrams),purge=Math.max(0,input.purgeGrams??0),safety=Math.max(0,input.safetyPercent??8)/100;
  return Number((sliced+purge+(sliced+purge)*safety+Math.max(0,input.minimumReserveGrams??15)).toFixed(2));
}

export function evaluatePreflight(input:PreflightInput):PreflightResult{
  const now=new Date(input.now??Date.now()),freshnessMinutes=Math.max(1,input.freshnessMinutes??5),checks:PreflightCheck[]=[];
  checks.push(input.file.complete?check("FILE_COMPLETE","file","pass","文件完整"):check("FILE_INCOMPLETE","file","block","文件不完整或校验失败",["重新上传文件"]));
  checks.push(input.file.sliced?check("FILE_SLICED","file","pass","文件已切片"):check("FILE_NOT_SLICED","file","block","文件尚未切片",["使用 Bambu Studio 重新切片"]));
  checks.push(same(input.file.printerModel,input.printer.model)?check("MODEL_MATCH","printer","pass","文件机型与目标打印机一致"):check("MODEL_MISMATCH","printer","block",`文件适用于 ${input.file.printerModel}，目标设备为 ${input.printer.model}`,["更换打印机","按目标机型重新切片"]));
  checks.push(Math.abs(input.file.nozzleMm-input.printer.nozzleMm)<0.001?check("NOZZLE_MATCH","printer","pass","喷嘴直径匹配"):check("NOZZLE_MISMATCH","printer","block",`文件需要 ${input.file.nozzleMm}mm 喷嘴，设备为 ${input.printer.nozzleMm}mm`,["更换喷嘴","重新切片"]));
  checks.push(same(input.file.buildPlate,input.printer.buildPlate)?check("PLATE_MATCH","printer","pass","打印板匹配"):check("PLATE_MISMATCH","printer","block",`文件打印板 ${input.file.buildPlate} 与设备 ${input.printer.buildPlate} 不匹配`,["更换打印板","重新切片"]));
  checks.push(input.printer.online?check("PRINTER_ONLINE","printer","pass","打印机在线"):check("PRINTER_OFFLINE","printer","unknown","打印机离线，无法确认实时状态",["检查本地网关","刷新设备状态"]));
  if(input.printer.fault)checks.push(check("PRINTER_FAULT","printer","block",`打印机故障：${input.printer.fault}`,["处理设备故障后重新检查"]));
  const observed=input.printer.observedAt?new Date(input.printer.observedAt):null;
  if(!observed||Number.isNaN(observed.valueOf()))checks.push(check("PRINTER_DATA_UNKNOWN","printer","unknown","没有可靠的设备状态时间",["刷新设备状态"]));
  else {const age=(now.valueOf()-observed.valueOf())/60000;checks.push(age<=freshnessMinutes?check("PRINTER_DATA_FRESH","printer","pass","设备状态为实时数据"):check("PRINTER_DATA_STALE","printer","warning",`设备数据已过期 ${Math.ceil(age)} 分钟`,["刷新设备状态"],{ageMinutes:age}));}
  for(const requirement of input.materialRequirements){
    const slot=input.materialSlots.find(item=>item.slot===requirement.slot),needed=requiredMaterialGrams(requirement);
    if(!slot){checks.push(check("AMS_SLOT_MISSING","material","block",`AMS ${requirement.slot} 未装载所需耗材`,["装入并绑定耗材卷","更换 AMS 槽位"],{slot:requirement.slot,requiredGrams:needed}));continue;}
    if(!same(slot.material,requirement.material)){checks.push(check("MATERIAL_MISMATCH","material","block",`AMS ${slot.slot} 为 ${slot.material}，需要 ${requirement.material}`,["更换耗材卷","重新映射 AMS 槽位"]));continue;}
    if(slot.remainingGrams==null){checks.push(check("MATERIAL_AMOUNT_UNKNOWN","material","unknown",`AMS ${slot.slot} 余量未知，需要 ${needed}g`,["称重或同步耗材余量"]));continue;}
    checks.push(slot.remainingGrams>=needed?check("MATERIAL_SUFFICIENT","material","pass",`AMS ${slot.slot} 余量充足：需要 ${needed}g，可用 ${slot.remainingGrams}g`,[],{requiredGrams:needed,remainingGrams:slot.remainingGrams}):check("MATERIAL_INSUFFICIENT","material","block",`AMS ${slot.slot} 耗材不足：需要 ${needed}g，可用 ${slot.remainingGrams}g`,["更换耗材卷","减少打印数量","重新切片"],{requiredGrams:needed,remainingGrams:slot.remainingGrams,shortageGrams:Number((needed-slot.remainingGrams).toFixed(2))}));
  }
  checks.push(input.order.valid?check("ORDER_VALID","production","pass","订单有效"):check("ORDER_INVALID","production","block",input.order.reason||"订单无效或已取消",["检查订单状态"]));
  checks.push(input.permission.canDispatch?check("DISPATCH_ALLOWED","permission","pass","具备下发权限"):check("DISPATCH_FORBIDDEN","permission","block","当前账号没有打印下发权限",["联系管理员授予打印机控制权限"]));
  const level=checks.reduce<PreflightLevel>((value,item)=>rank[item.level]>rank[value]?item.level:value,"pass");
  return {runId:input.runId??crypto.randomUUID(),level,dispatchAllowed:level==="pass",overrideAllowed:level==="warning"&&Boolean(input.permission.canOverride),checks,evaluatedAt:now.toISOString(),dataFreshAt:input.printer.observedAt};
}
