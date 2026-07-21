import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import SettlementClient from "./settlement-client";

export const dynamic = "force-dynamic";
export default async function SettlementPage(){const user=await getAccessContext();if(!user)redirect("/");return <SettlementClient canEdit={["owner","manager","warehouse"].includes(user.role)}/>}
