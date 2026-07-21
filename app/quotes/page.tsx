import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import QuotesClient from "./quotes-client";
export const dynamic="force-dynamic";
export default async function QuotesPage(){const user=await getAccessContext();if(!user)redirect("/");return <QuotesClient canEdit={["owner","manager","orders"].includes(user.role)}/>}
