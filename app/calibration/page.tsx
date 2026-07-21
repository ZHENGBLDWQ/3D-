import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import CalibrationClient from "./calibration-client";

export const dynamic="force-dynamic";
export default async function CalibrationPage(){const user=await getAccessContext();if(!user)redirect("/");return <CalibrationClient canEdit={["owner","manager","warehouse"].includes(user.role)}/>}
