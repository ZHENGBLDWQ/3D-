import {getD1} from "../../../db";
import {getAccessContext} from "../../access-control";
import {requireApiAccess} from "../../api-auth";

const fail=(error:string,status=400)=>Response.json({error,mode:"monitor_only"},{status});
async function context(){const denied=await requireApiAccess();if(denied)return{denied};const user=await getAccessContext();return user?{user}:{denied:fail("请先登录",401)}}

export async function GET(){const access=await context();if(access.denied)return access.denied;const user=access.user!,db=getD1();const scope=user.printerScope,extra=scope.length?` AND p.id IN (${scope.map(()=>"?").join(",")})`:"",args=[user.organizationId,...scope];const rows=await db.prepare(`SELECT p.* FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id WHERE pb.organization_id=?${extra} ORDER BY p.created_at DESC`).bind(...args).all<Record<string,unknown>>();const ids=rows.results.map(row=>Number(row.id));if(!ids.length)return Response.json({mode:"monitor_only",printers:[]});const marks=ids.map(()=>"?").join(","),[slots,usage]=await Promise.all([db.prepare(`SELECT * FROM bambu_ams_slots WHERE printer_id IN (${marks})`).bind(...ids).all<Record<string,unknown>>(),db.prepare(`SELECT * FROM bambu_material_usage WHERE printer_id IN (${marks}) ORDER BY completed_at DESC LIMIT 200`).bind(...ids).all<Record<string,unknown>>()]);return Response.json({mode:"monitor_only",printers:rows.results.map(p=>({...p,amsSlots:slots.results.filter(s=>s.printer_id===p.id),materialUsage:usage.results.filter(u=>u.printer_id===p.id)}))})}

export async function POST(){const denied=await requireApiAccess(true,"system.manage");if(denied)return denied;return fail("监控模式下请通过本地网关发现并绑定打印机；系统不会创建可控设备",409)}

export async function PATCH(request:Request){const denied=await requireApiAccess(true,"system.manage");if(denied)return denied;const user=await getAccessContext();if(!user)return fail("请先登录",401);const body=await request.json() as{id?:number;action?:string};if(body.action==="command")return fail("当前为只读监控模式。请在 Bambu Studio 或打印机上执行启动、暂停、继续和取消",409);const id=Number(body.id);const owned=await getD1().prepare("SELECT 1 FROM printer_bindings WHERE printer_id=? AND organization_id=?").bind(id,user.organizationId).first();if(!owned)return fail("打印机不存在",404);return fail("监控模式仅允许在系统设置中维护网关绑定",409)}

export async function DELETE(){const denied=await requireApiAccess(true,"system.manage");if(denied)return denied;return fail("监控模式不允许从旧设备接口删除打印机，请在网关绑定页面解除绑定",409)}
