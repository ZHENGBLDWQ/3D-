import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import ProcurementClient from "./procurement-client";
import "./procurement.css";
export const dynamic="force-dynamic";
export default async function ProcurementPage(){const user=await getAccessContext();if(!user)redirect("/");return <ProcurementClient/>}
