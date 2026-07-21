import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import GatewayClient from "./gateway-client";
export const dynamic="force-dynamic";
export default async function GatewayPage(){const user=await getAccessContext();if(!user)redirect("/");return <GatewayClient canManage={["owner","manager"].includes(user.role)}/>}
