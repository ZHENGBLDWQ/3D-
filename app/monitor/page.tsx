import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import MonitorClient from "./monitor-client";
export const dynamic="force-dynamic";
export default async function MonitorPage(){if(!await getAccessContext())redirect("/");return <MonitorClient/>}
