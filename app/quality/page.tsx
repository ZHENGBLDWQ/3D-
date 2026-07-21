import {redirect} from "next/navigation";
import {can,getAccessContext} from "../access-control";
import QualityClient from "./quality-client";
export const dynamic="force-dynamic";
export default async function QualityPage(){const user=await getAccessContext();if(!user)redirect("/");return <QualityClient canSettle={can(user,"printers.control")}/>}
