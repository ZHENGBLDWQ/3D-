import {redirect} from "next/navigation";
import {can,getAccessContext} from "../access-control";
import ReceivablesClient from "./receivables-client";
export const dynamic="force-dynamic";
export default async function ReceivablesPage(){const user=await getAccessContext();if(!user||!can(user,"finance.read"))redirect("/");return <ReceivablesClient/>}
