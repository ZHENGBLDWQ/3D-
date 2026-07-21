import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import PreflightClient from "./preflight-client";
export const dynamic="force-dynamic";
export default async function PreflightPage(){if(!await getAccessContext())redirect("/");return <PreflightClient/>}
