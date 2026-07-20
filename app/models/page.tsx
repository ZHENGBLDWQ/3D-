import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import ModelLibraryClient from "./model-library-client";
export const dynamic="force-dynamic";
export default async function ModelLibraryPage(){const user=await getAccessContext();if(!user)redirect("/");return <ModelLibraryClient canWrite={["owner","manager","orders"].includes(user.role)}/>}
