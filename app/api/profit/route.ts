import {getProfitReport} from "../../../profit/data";
import {requireApiAccess} from "../../api-auth";

export async function GET(){
  const denied=await requireApiAccess(false,"finance.read");if(denied)return denied;
  const {getAccessContext}=await import("../../access-control");const context=await getAccessContext();
  if(!context)return Response.json({error:"请先登录"},{status:401});
  try{return Response.json(await getProfitReport(context.organizationId))}catch(error){return Response.json({error:error instanceof Error?error.message:"利润分析读取失败"},{status:500})}
}
