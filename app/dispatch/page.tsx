import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import DispatchClient from "./dispatch-client";

export const dynamic="force-dynamic";
export default async function DispatchPage(){const user=await getAccessContext();if(!user)redirect("/");return <DispatchClient/>;}
