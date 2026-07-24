import {getAccessContext} from "../../../access-control";
import {requireApiAccess} from "../../../api-auth";
import {getProductionReadiness} from "../../../../operations/readiness";
export async function GET(){const denied=await requireApiAccess(false,"system.manage");if(denied)return denied;const user=await getAccessContext();if(!user)return Response.json({error:"请先登录"},{status:401});return Response.json(await getProductionReadiness(user.organizationId),{headers:{"Cache-Control":"private, no-store"}})}
