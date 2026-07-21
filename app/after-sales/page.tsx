import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import AfterSalesClient from "./after-sales-client";
export const dynamic="force-dynamic";
export default async function AfterSalesPage(){const user=await getAccessContext();if(!user)redirect("/");return <AfterSalesClient canEdit={["owner","manager","orders"].includes(user.role)}/>}
