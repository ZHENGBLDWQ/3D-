import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import VarianceClient from "./variance-client";

export const dynamic="force-dynamic";
export default async function MaterialVariancesPage(){const user=await getAccessContext();if(!user)redirect("/");return <VarianceClient/>}
