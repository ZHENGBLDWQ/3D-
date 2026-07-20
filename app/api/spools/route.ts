import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { spoolmanSpools } from "../../../db/schema";
import { requireApiAccess } from "../../api-auth";

export async function GET(){const denied=await requireApiAccess();if(denied)return denied;try{const spools=await getDb().select().from(spoolmanSpools).orderBy(asc(spoolmanSpools.archived),asc(spoolmanSpools.remainingWeight));return Response.json({spools});}catch(error){return Response.json({error:error instanceof Error?error.message:"读取耗材卷失败"},{status:500});}}
