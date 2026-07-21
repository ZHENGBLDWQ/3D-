import {redirect} from "next/navigation";
import {can,getAccessContext} from "../access-control";
import RecoveryClient from "./recovery-client";
import "./recovery.css";
export const dynamic="force-dynamic";
export default async function RecoveryPage(){const user=await getAccessContext();if(!user)redirect("/");if(!can(user,"system.manage"))redirect("/");return <RecoveryClient/>}
