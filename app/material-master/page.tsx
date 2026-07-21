import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import MaterialMasterClient from "./material-master-client";

export const dynamic="force-dynamic";
export default async function MaterialMasterPage(){const user=await getAccessContext();if(!user)redirect("/");return <MaterialMasterClient canEdit={["owner","manager","warehouse"].includes(user.role)}/>}
