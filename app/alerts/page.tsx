import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import AlertCenter from "./alert-center";
export const dynamic="force-dynamic";
export default async function AlertsPage(){const user=await getAccessContext();if(!user)redirect("/");return <AlertCenter canManage={["owner","manager","orders"].includes(user.role)} canOperate={["owner","manager","operator"].includes(user.role)}/>}
