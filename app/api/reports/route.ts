import {getD1} from "../../../db";
import {buildCsv,normalizeRange} from "../../../reporting/report";
import {getOperationsReport} from "../../../reporting/data";
import {getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";

export async function GET(request:Request){
  const denied=await requireApiAccess(false,"finance.read");if(denied)return denied;
  const context=await getAccessContext();if(!context)return Response.json({error:"请先登录"},{status:401});
  try{
    const url=new URL(request.url),range=normalizeRange(url.searchParams.get("from"),url.searchParams.get("to"));
    const report=await getOperationsReport(context.organizationId,range);
    if(url.searchParams.get("format")!=="csv")return Response.json(report);
    const csv=buildCsv(report.rows);
    await getD1().prepare("INSERT INTO report_exports(organization_id,actor_email,date_from,date_to,format,row_count) VALUES(?,?,?,?,?,?)").bind(context.organizationId,context.email,range.from,range.to,"csv",report.rows.length).run();
    await recordAudit(context,"report.export","operations",`${range.from}:${range.to}`,{format:"csv",rowCount:report.rows.length});
    return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="layertrace-${range.from}-${range.to}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"报表生成失败"},{status:400})}
}
